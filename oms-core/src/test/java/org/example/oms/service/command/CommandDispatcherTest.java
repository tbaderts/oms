package org.example.oms.service.command;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.oms.mapper.OrderMapper;
import org.example.oms.model.CommandSource;
import org.example.oms.service.command.OrderCreateCommandProcessor.OrderCreateResult;
import org.example.oms.service.commandlog.CommandLogWriter;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor.ExecutionProcessingResult;
import org.example.oms.service.lifecycle.LifecycleAction;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor.OrderLifecycleResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.OptimisticLockingFailureException;

/**
 * SPEC-0046: one place routes every command and logs what became of it. Applied commands are
 * logged in the command's transaction, refused and failed ones on their own.
 */
@ExtendWith(MockitoExtension.class)
class CommandDispatcherTest {

    private static final Instant RECEIVED = Instant.parse("2026-11-07T10:00:00Z");
    private static final CommandOrigin REST = CommandOrigin.rest(RECEIVED);

    @Mock private OrderCreateCommandProcessor create;
    @Mock private ExecutionCommandProcessor execution;
    @Mock private OrderLifecycleCommandProcessor lifecycle;
    @Mock private OrderMapper orderMapper;
    @Mock private CommandLogWriter log;
    @Mock private jakarta.persistence.EntityManager entityManager;

    private CommandDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        dispatcher = new CommandDispatcher(create, execution, lifecycle, orderMapper, log, entityManager);
    }

    @Test
    void appliedLifecycleCommandIsLoggedWithItsEventVersion() {
        var command = new OrderCancelRequestCmd("ORD-1", "OrderCancelRequestCmd").commandId("C-1");
        when(lifecycle.process(command, RECEIVED)).thenReturn(OrderLifecycleResult.builder()
                .success(true).orderId("ORD-1").action(LifecycleAction.CANCEL_REQUEST).eventVersion(3L).build());

        var applied = assertInstanceOf(CommandDispatch.Applied.class, dispatcher.dispatch(command, REST));

        assertEquals("ORD-1", applied.orderId());
        assertEquals(3L, applied.eventVersion());
        assertEquals("CANCEL_REQUEST applied to order ORD-1", applied.message());
        verify(log).applied(command, REST, "ORD-1", 3L);
        verify(log, never()).refused(any(), any(), any(), any());
    }

    @Test
    void acceptKeepsItsMessages() {
        var command = new OrderAcceptCmd("ORD-2", "OrderAcceptCmd");
        when(lifecycle.process(command, RECEIVED)).thenReturn(OrderLifecycleResult.builder()
                .success(true).orderId("ORD-2").action(LifecycleAction.ACCEPT).eventVersion(2L).build());

        var applied = assertInstanceOf(CommandDispatch.Applied.class, dispatcher.dispatch(command, REST));

        assertEquals("Order accepted successfully: ORD-2", applied.message());
    }

    @Test
    void refusedCommandIsLoggedAsRefusedWithItsReason() {
        var command = new OrderCancelRequestCmd("ORD-1", "OrderCancelRequestCmd");
        when(lifecycle.process(command, RECEIVED)).thenReturn(OrderLifecycleResult.builder()
                .success(false).orderId("ORD-1").action(LifecycleAction.CANCEL_REQUEST)
                .errorMessage("CANCEL_REQUEST not allowed").build());

        var refused = assertInstanceOf(CommandDispatch.Refused.class, dispatcher.dispatch(command, REST));

        assertEquals("CANCEL_REQUEST not allowed", refused.reason());
        assertEquals(false, refused.duplicate());
        verify(log).refused(command, REST, "ORD-1", "CANCEL_REQUEST not allowed");
        verify(log, never()).applied(any(), any(), any(), any());
    }

    @Test
    void duplicateIsARefusalMarkedDuplicate() {
        var command = new OrderCancelRequestCmd("ORD-1", "OrderCancelRequestCmd").commandId("C-1");
        when(lifecycle.process(command, RECEIVED)).thenReturn(OrderLifecycleResult.builder()
                .success(false).duplicate(true).orderId("ORD-1").action(LifecycleAction.CANCEL_REQUEST)
                .errorMessage("Duplicate command C-1 for order ORD-1").build());

        var refused = assertInstanceOf(CommandDispatch.Refused.class, dispatcher.dispatch(command, REST));

        assertTrue(refused.duplicate());
        assertEquals("C-1", refused.commandId());
        verify(log).refused(command, REST, "ORD-1", "Duplicate command C-1 for order ORD-1");
    }

    @Test
    void failureIsLoggedAsFailedAndRethrown() {
        var command = new ExecutionCreateCmd().type("ExecutionCreateCmd")
                .execution(new org.example.common.model.cmd.Execution().execId("EX-1").orderId("ORD-404"));
        Execution mapped = Execution.builder().execId("EX-1").orderId("ORD-404").build();
        when(orderMapper.toExecution(command.getExecution())).thenReturn(mapped);
        IllegalArgumentException missing = new IllegalArgumentException("Order not found for orderId: ORD-404");
        when(execution.process(mapped, command)).thenThrow(missing);
        CommandOrigin kafka = CommandOrigin.kafka("exchange-simulator", RECEIVED);

        assertSame(missing, assertThrows(IllegalArgumentException.class, () -> dispatcher.dispatch(command, kafka)));

        verify(log).failed(command, kafka, "ORD-404", "Order not found for orderId: ORD-404");
        assertEquals(CommandSource.KAFKA, kafka.source());
        assertEquals("exchange-simulator", kafka.principal());
    }

    @Test
    void concurrencyConflictIsLoggedAsFailedAndRethrown() {
        var command = new OrderCancelRequestCmd("ORD-1", "OrderCancelRequestCmd");
        when(lifecycle.process(command, RECEIVED)).thenThrow(new OptimisticLockingFailureException("order changed"));

        assertThrows(OptimisticLockingFailureException.class, () -> dispatcher.dispatch(command, REST));

        verify(log).failed(eq(command), eq(REST), eq("ORD-1"), anyString());
    }

    @Test
    void appliedFillAndCreateReportTheirIds() {
        var fill = new ExecutionCreateCmd().type("ExecutionCreateCmd")
                .execution(new org.example.common.model.cmd.Execution().execId("EX-1").orderId("ORD-1"));
        Execution mapped = Execution.builder().execId("EX-1").orderId("ORD-1").build();
        when(orderMapper.toExecution(fill.getExecution())).thenReturn(mapped);
        when(execution.process(mapped, fill)).thenReturn(ExecutionProcessingResult.builder()
                .success(true).order(Order.builder().orderId("ORD-1").build()).execution(mapped).eventVersion(4L).build());
        var created = new OrderCreateCmd().type("OrderCreateCmd");
        when(create.process(created, RECEIVED)).thenReturn(OrderCreateResult.builder()
                .success(true).orderId("ORD-9").eventVersion(1L).build());

        var appliedFill = assertInstanceOf(CommandDispatch.Applied.class, dispatcher.dispatch(fill, REST));
        var appliedCreate = assertInstanceOf(CommandDispatch.Applied.class, dispatcher.dispatch(created, REST));

        assertEquals("EX-1", appliedFill.resultId());
        assertTrue(appliedFill.created());
        assertEquals("ORD-9", appliedCreate.resultId());
        assertEquals("Order created successfully: ORD-9", appliedCreate.message());
        verify(log).applied(fill, REST, "ORD-1", 4L);
        verify(log).applied(created, REST, "ORD-9", 1L);
    }
}
