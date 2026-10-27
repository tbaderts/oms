package org.example.oms.service.lifecycle;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.example.common.model.CancelState;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.OrderCancelCmd;
import org.example.common.model.cmd.OrderCancelRejectCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderRejectCmd;
import org.example.common.orchestration.TaskOrchestrator;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.OrderEventAppender;
import org.example.oms.service.command.tasks.PublishOrderEventTask;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor.OrderLifecycleResult;
import org.example.oms.service.lifecycle.tasks.ApplyLifecycleActionTask;
import org.example.oms.service.lifecycle.tasks.DeduplicateCommandTask;
import org.example.oms.service.lifecycle.tasks.LoadOrderTask;
import org.example.oms.service.lifecycle.tasks.SaveOrderTask;
import org.example.oms.service.lifecycle.tasks.ValidateLifecycleActionTask;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/**
 * Runs the real pipeline and tasks against a mocked repository and appender, so each rule in the
 * {@link LifecycleAction} table is exercised exactly as production runs it.
 */
@ExtendWith(MockitoExtension.class)
class OrderLifecycleCommandProcessorTest {

    private static final String ORDER_ID = "ORD-1";
    private static final String CLIENT_TEXT = "Sample order";

    @Mock private OrderRepository orderRepository;

    @Mock private OrderEventAppender orderEventAppender;

    @Mock private OrderEventRepository orderEventRepository;

    private OrderLifecycleCommandProcessor processor;

    @BeforeEach
    void setUp() {
        processor =
                new OrderLifecycleCommandProcessor(
                        new TaskOrchestrator(),
                        new LoadOrderTask(orderRepository),
                        new DeduplicateCommandTask(orderEventRepository),
                        new ValidateLifecycleActionTask(),
                        new ApplyLifecycleActionTask(),
                        new SaveOrderTask(orderRepository),
                        new PublishOrderEventTask(orderEventAppender));
        lenient()
                .when(orderRepository.saveAndFlush(any(Order.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    // ----------------------------------------------------------------------------------------
    // Effects
    // ----------------------------------------------------------------------------------------

    @Test
    void reject_onUnackOrder_movesToRejWithReasonAndNoOpenQuantity() {
        givenOrder(order(State.UNACK, null, "100", "0", "100"));
        OrderRejectCmd command = new OrderRejectCmd(ORDER_ID, "OrderRejectCmd").text("Unknown symbol ZZZZ");

        OrderLifecycleResult result = processor.process(command, Instant.now());

        assertTrue(result.isSuccess(), result.getErrorMessage());
        Order saved = savedOrder();
        assertEquals(State.REJ, saved.getState());
        assertEquals(0, BigDecimal.ZERO.compareTo(saved.getLeavesQty()));
        assertEquals("Unknown symbol ZZZZ", saved.getRejectReason());
        assertEquals(CLIENT_TEXT, saved.getText(), "the client's text must survive a reject");
        verify(orderEventAppender).appendOrderEvent(any(), eq(Event.REJ), eq(command));
    }

    @Test
    void cancel_onPartiallyFilledLiveOrder_closesOpenQuantityAndKeepsCumQty() {
        givenOrder(order(State.LIVE, CancelState.PCXL, "100", "40", "60"));
        OrderCancelCmd command = new OrderCancelCmd(ORDER_ID, "OrderCancelCmd");

        OrderLifecycleResult result = processor.process(command, Instant.now());

        assertTrue(result.isSuccess(), result.getErrorMessage());
        Order saved = savedOrder();
        assertEquals(State.CXL, saved.getState());
        assertEquals(CancelState.CXL, saved.getCancelState());
        assertEquals(0, BigDecimal.ZERO.compareTo(saved.getLeavesQty()));
        assertEquals(0, new BigDecimal("40").compareTo(saved.getCumQty()));
        verify(orderEventAppender).appendOrderEvent(any(), eq(Event.CXL), eq(command));
    }

    @Test
    void cancelRequest_onLiveOrder_setsPendingCancelAndKeepsState() {
        givenOrder(order(State.LIVE, null, "100", "0", "100"));
        OrderCancelRequestCmd command = new OrderCancelRequestCmd(ORDER_ID, "OrderCancelRequestCmd");

        OrderLifecycleResult result = processor.process(command, Instant.now());

        assertTrue(result.isSuccess(), result.getErrorMessage());
        Order saved = savedOrder();
        assertEquals(State.LIVE, saved.getState());
        assertEquals(CancelState.PCXL, saved.getCancelState());
        assertEquals(0, new BigDecimal("100").compareTo(saved.getLeavesQty()));
        verify(orderEventAppender).appendOrderEvent(any(), eq(Event.CXL_REQUEST), eq(command));
    }

    @Test
    void cancelReject_onPendingCancel_setsCancelStateRejAndKeepsOrderLive() {
        givenOrder(order(State.LIVE, CancelState.PCXL, "100", "0", "100"));
        OrderCancelRejectCmd command =
                new OrderCancelRejectCmd(ORDER_ID, "OrderCancelRejectCmd").text("Unknown order");

        OrderLifecycleResult result = processor.process(command, Instant.now());

        assertTrue(result.isSuccess(), result.getErrorMessage());
        Order saved = savedOrder();
        assertEquals(State.LIVE, saved.getState());
        assertEquals(CancelState.REJ, saved.getCancelState());
        assertEquals(0, new BigDecimal("100").compareTo(saved.getLeavesQty()));
        assertEquals("Unknown order", saved.getRejectReason());
        assertEquals(CLIENT_TEXT, saved.getText());
        verify(orderEventAppender).appendOrderEvent(any(), eq(Event.CXL_REJ), eq(command));
    }

    @Test
    void reject_truncatesReasonToTheColumnWidth() {
        givenOrder(order(State.UNACK, null, "100", "0", "100"));

        processor.process(
                new OrderRejectCmd(ORDER_ID, "OrderRejectCmd").text("A".repeat(255) + "B".repeat(145)), Instant.now());

        Order saved = savedOrder();
        assertEquals(State.REJ, saved.getState());
        assertEquals("A".repeat(255), saved.getRejectReason(), "keeps the first 255 characters");
        assertEquals(CLIENT_TEXT, saved.getText());
    }

    /** A successful cancel is not an error: its reason stays in the event log only. */
    @Test
    void cancel_withReason_doesNotTouchTextOrRejectReason() {
        givenOrder(order(State.LIVE, null, "100", "0", "100"));

        processor.process(
                new OrderCancelCmd(ORDER_ID, "OrderCancelCmd").text("IOC order not marketable"), Instant.now());

        Order saved = savedOrder();
        assertEquals(State.CXL, saved.getState());
        assertEquals(CLIENT_TEXT, saved.getText());
        assertNull(saved.getRejectReason());
    }

    /** The field is the latest refusal: a reject without a reason must not show an older one. */
    @Test
    void reject_withoutText_clearsAnEarlierReason() {
        Order refusedCancel = order(State.LIVE, CancelState.REJ, "100", "0", "100").toBuilder()
                .rejectReason("Too late to cancel")
                .build();
        givenOrder(refusedCancel);

        processor.process(new OrderRejectCmd(ORDER_ID, "OrderRejectCmd"), Instant.now());

        Order saved = savedOrder();
        assertEquals(State.REJ, saved.getState());
        assertNull(saved.getRejectReason());
        assertEquals(CLIENT_TEXT, saved.getText());
    }

    /** A pending cancel must not show why an earlier request was refused. */
    @Test
    void cancelRequest_clearsAnEarlierRejectReason() {
        Order refused = order(State.LIVE, CancelState.REJ, "100", "0", "100").toBuilder()
                .rejectReason("Too late to cancel")
                .build();
        givenOrder(refused);

        processor.process(new OrderCancelRequestCmd(ORDER_ID, "OrderCancelRequestCmd"), Instant.now());

        Order saved = savedOrder();
        assertEquals(CancelState.PCXL, saved.getCancelState());
        assertNull(saved.getRejectReason());
        assertEquals(CLIENT_TEXT, saved.getText());
    }

    // ----------------------------------------------------------------------------------------
    // Refusals (AC-9): no save, no event
    // ----------------------------------------------------------------------------------------

    @ParameterizedTest
    @EnumSource(value = State.class, names = {"FILLED", "REJ", "CXL"})
    void cancelRequest_onTerminalOrPendingOrder_refused(State state) {
        givenOrder(order(state, null, "100", "100", "0"));
        assertRefused(new OrderCancelRequestCmd(ORDER_ID, "OrderCancelRequestCmd"));
    }

    @Test
    void cancelRequest_whenCancelAlreadyPending_refused() {
        givenOrder(order(State.LIVE, CancelState.PCXL, "100", "0", "100"));
        assertRefused(new OrderCancelRequestCmd(ORDER_ID, "OrderCancelRequestCmd"));
    }

    @Test
    void cancelRequest_onUnackOrder_refused() {
        givenOrder(order(State.UNACK, null, "100", "0", "100"));
        assertRefused(new OrderCancelRequestCmd(ORDER_ID, "OrderCancelRequestCmd"));
    }

    @ParameterizedTest
    @EnumSource(value = State.class, names = {"FILLED", "REJ", "CXL", "CLOSED", "UNACK"})
    void cancel_onTerminal_refused(State state) {
        givenOrder(order(state, null, "100", "100", "0"));
        assertRefused(new OrderCancelCmd(ORDER_ID, "OrderCancelCmd"));
    }

    @ParameterizedTest
    @EnumSource(value = State.class, names = {"FILLED", "REJ", "CXL", "CLOSED"})
    void reject_onTerminal_refused(State state) {
        givenOrder(order(state, null, "100", "100", "0"));
        assertRefused(new OrderRejectCmd(ORDER_ID, "OrderRejectCmd"));
    }

    @Test
    void cancelReject_withoutPendingCancel_refused() {
        givenOrder(order(State.LIVE, null, "100", "0", "100"));
        assertRefused(new OrderCancelRejectCmd(ORDER_ID, "OrderCancelRejectCmd"));
    }

    @Test
    void cancelReject_afterAnEarlierCancelReject_refused() {
        givenOrder(order(State.LIVE, CancelState.REJ, "100", "0", "100"));
        assertRefused(new OrderCancelRejectCmd(ORDER_ID, "OrderCancelRejectCmd"));
    }

    @Test
    void unknownOrder_refused() {
        when(orderRepository.findByOrderId(ORDER_ID)).thenReturn(Optional.empty());

        OrderLifecycleResult result =
                processor.process(new OrderCancelCmd(ORDER_ID, "OrderCancelCmd"), Instant.now());

        assertFalse(result.isSuccess());
        assertTrue(result.getErrorMessage().contains("Order not found"), result.getErrorMessage());
        verifyNothingWritten();
    }

    @Test
    void blankOrderId_refused() {
        OrderLifecycleResult result =
                processor.process(new OrderRejectCmd("", "OrderRejectCmd"), Instant.now());

        assertFalse(result.isSuccess());
        assertEquals("orderId is required", result.getErrorMessage());
        verifyNothingWritten();
    }

    @Test
    void unsupportedCommand_isAProgrammingError() {
        Command command = new org.example.common.model.cmd.OrderAcceptCmd(ORDER_ID, "OrderAcceptCmd");
        assertThrows(IllegalArgumentException.class, () -> processor.process(command, Instant.now()));
    }

    // ----------------------------------------------------------------------------------------
    // Replay (P-08, AC-10): state preconditions alone are not enough
    // ----------------------------------------------------------------------------------------

    /**
     * After a cancel reject the order is LIVE/REJ, so a replayed cancel request satisfies the
     * state precondition again. Only its commandId tells it apart from a genuinely new request.
     */
    @Test
    void duplicateCommandId_refusedWithoutWrites() {
        givenOrder(order(State.LIVE, CancelState.REJ, "100", "0", "100"));
        when(orderEventRepository.findByOrderIdOrderByVersionAsc(ORDER_ID))
                .thenReturn(List.of(OrderEvent.builder()
                        .orderId(ORDER_ID)
                        .version(3L)
                        .event(Event.CXL_REQUEST)
                        .transaction(new OrderCancelRequestCmd(ORDER_ID, "OrderCancelRequestCmd").commandId("CR-1"))
                        .build()));

        OrderLifecycleResult result =
                processor.process(
                        new OrderCancelRequestCmd(ORDER_ID, "OrderCancelRequestCmd").commandId("CR-1"),
                        Instant.now());

        assertFalse(result.isSuccess());
        assertTrue(result.getErrorMessage().contains("Duplicate command CR-1"), result.getErrorMessage());
        verifyNothingWritten();
    }

    @Test
    void newCommandId_isApplied() {
        givenOrder(order(State.LIVE, CancelState.REJ, "100", "0", "100"));
        when(orderEventRepository.findByOrderIdOrderByVersionAsc(ORDER_ID))
                .thenReturn(List.of(OrderEvent.builder()
                        .orderId(ORDER_ID)
                        .version(3L)
                        .event(Event.CXL_REQUEST)
                        .transaction(new OrderCancelRequestCmd(ORDER_ID, "OrderCancelRequestCmd").commandId("CR-1"))
                        .build()));

        OrderLifecycleResult result =
                processor.process(
                        new OrderCancelRequestCmd(ORDER_ID, "OrderCancelRequestCmd").commandId("CR-2"),
                        Instant.now());

        assertTrue(result.isSuccess(), result.getErrorMessage());
        assertEquals(CancelState.PCXL, savedOrder().getCancelState());
    }

    @Test
    void commandWithoutId_skipsTheLookup() {
        givenOrder(order(State.LIVE, null, "100", "0", "100"));

        assertTrue(processor.process(new OrderCancelCmd(ORDER_ID, "OrderCancelCmd"), Instant.now()).isSuccess());
        verify(orderEventRepository, never()).findByOrderIdOrderByVersionAsc(any());
    }

    // ----------------------------------------------------------------------------------------
    // Concurrency (P-08): a txNr conflict must surface, not become a silent refusal
    // ----------------------------------------------------------------------------------------

    @Test
    void optimisticLockConflict_isRethrownSoTheCallerCanRetry() {
        givenOrder(order(State.LIVE, null, "100", "0", "100"));
        when(orderRepository.saveAndFlush(any(Order.class)))
                .thenThrow(new ObjectOptimisticLockingFailureException(Order.class, 1L));

        assertThrows(
                ObjectOptimisticLockingFailureException.class,
                () -> processor.process(new OrderCancelCmd(ORDER_ID, "OrderCancelCmd"), Instant.now()));
        verify(orderEventAppender, never()).appendOrderEvent(any(), any(), any());
    }

    // ----------------------------------------------------------------------------------------

    private void assertRefused(Command command) {
        OrderLifecycleResult result = processor.process(command, Instant.now());

        assertFalse(result.isSuccess(), "expected refusal for " + command);
        assertTrue(result.getErrorMessage().contains("not allowed"), result.getErrorMessage());
        verifyNothingWritten();
    }

    private void verifyNothingWritten() {
        verify(orderRepository, never()).saveAndFlush(any());
        verify(orderRepository, never()).save(any());
        verify(orderEventAppender, never()).appendOrderEvent(any(), any(), any());
    }

    private void givenOrder(Order order) {
        when(orderRepository.findByOrderId(ORDER_ID)).thenReturn(Optional.of(order));
    }

    private Order savedOrder() {
        ArgumentCaptor<Order> captor = ArgumentCaptor.forClass(Order.class);
        verify(orderRepository).saveAndFlush(captor.capture());
        return captor.getValue();
    }

    private static Order order(
            State state, CancelState cancelState, String qty, String cum, String leaves) {
        Order order =
                Order.builder()
                        .id(1L)
                        .orderId(ORDER_ID)
                        .state(state)
                        .cancelState(cancelState)
                        .orderQty(new BigDecimal(qty))
                        .cumQty(new BigDecimal(cum))
                        .leavesQty(new BigDecimal(leaves))
                        .text(CLIENT_TEXT)
                        .build();
        assertNull(order.getRejectReason());
        return order;
    }
}
