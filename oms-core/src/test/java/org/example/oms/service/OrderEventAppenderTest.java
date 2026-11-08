package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import java.sql.SQLException;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.oms.mapper.AvroPayloadCodec;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OrderEventSchemaVersion;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderRepository;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.service.metrics.OrderFlowMetrics;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * SPEC-0027: the event version is the order's own version. The appender takes the next one from the
 * order, sets it on the order and finds a concurrent writer through the event log's unique version.
 */
@ExtendWith(MockitoExtension.class)
class OrderEventAppenderTest {

    @Mock private OrderEventRepository orderEventRepository;
    @Mock private OutboxRepository outboxRepository;

    private OrderEventAppender appender;

    @BeforeEach
    void setUp() {
        appender = new OrderEventAppender(
                orderEventRepository, outboxRepository, "oms_orders", "oms_executions", new AvroPayloadCodec(),
                new OrderFlowMetrics(new SimpleMeterRegistry(), mock(OrderRepository.class)),
                mock(org.example.oms.repository.ExecutionRepository.class),
                new org.example.oms.mapper.OrderExecutionMessageMapper(),
                "oms_order_executions",
                mock(OutboxNudge.class));
    }

    // AC-2
    @Test
    void appendsTheOrdersNextVersionWithoutQuerying() {
        Order order = order(4L);

        long version = appender.appendOrderEvent(order, Event.ACK, null);

        assertEquals(5L, version);
        assertEquals(5L, order.getTxNr(), "the order carries the version of its latest event");
        ArgumentCaptor<OrderEvent> event = ArgumentCaptor.forClass(OrderEvent.class);
        verify(orderEventRepository).saveAndFlush(event.capture());
        assertEquals(5L, event.getValue().getVersion());
        assertEquals(5L, event.getValue().getOrderSnapshot().getTxNr(), "the snapshot is the order after the event");
        verifyNoMoreInteractions(orderEventRepository);
    }

    // AC-3
    @Test
    void versionConflictBecomesOptimisticLockingFailure() {
        when(orderEventRepository.saveAndFlush(any())).thenThrow(violation("uq_order_events_order_id_version"));

        OptimisticLockingFailureException conflict = assertThrows(
                OptimisticLockingFailureException.class, () -> appender.appendOrderEvent(order(2L), Event.ACK, null));

        assertEquals(true, conflict.getMessage().contains("ORD-1"), conflict.getMessage());
    }

    /**
     * SPEC-0046 AC-6: a commandId the order already applied, caught by the unique constraint when two
     * deliveries race past the dedup lookup, is the same typed refusal as one the lookup catches.
     */
    @Test
    void commandIdConstraintBecomesDuplicateCommand() {
        when(orderEventRepository.saveAndFlush(any())).thenThrow(violation("uq_order_events_order_id_command_id"));
        var command = new org.example.common.model.cmd.OrderCancelRequestCmd("ORD-1", "OrderCancelRequestCmd")
                .commandId("C-9");

        DuplicateCommandException duplicate = assertThrows(
                DuplicateCommandException.class, () -> appender.appendOrderEvent(order(2L), Event.CXL_REQUEST, command));

        assertEquals("ORD-1", duplicate.getOrderId());
        assertEquals("C-9", duplicate.getCommandId());
    }

    // Any other constraint keeps its own meaning.
    @Test
    void otherConstraintViolationsPropagate() {
        DataIntegrityViolationException other = violation("uq_some_other_constraint");
        when(orderEventRepository.saveAndFlush(any())).thenThrow(other);

        DataIntegrityViolationException thrown = assertThrows(
                DataIntegrityViolationException.class, () -> appender.appendOrderEvent(order(2L), Event.ACK, null));

        assertSame(other, thrown);
    }

    // SPEC-0024: every appended event records its schema version.
    @Test
    void appendsTheCurrentSchemaVersion() {
        appender.appendOrderEvent(order(4L), Event.ACK, null);

        ArgumentCaptor<OrderEvent> event = ArgumentCaptor.forClass(OrderEvent.class);
        verify(orderEventRepository).saveAndFlush(event.capture());
        assertEquals(
                OrderEventSchemaVersion.CURRENT, event.getValue().getSchemaVersion(),
                "the event records the schema version that wrote it");
    }

    private static Order order(long txNr) {
        return Order.builder().orderId("ORD-1").state(State.LIVE).txNr(txNr).build();
    }

    private static DataIntegrityViolationException violation(String constraint) {
        return new DataIntegrityViolationException(
                "could not execute statement",
                new ConstraintViolationException(
                        "duplicate key value violates unique constraint \"" + constraint + "\"",
                        new SQLException("duplicate key value violates unique constraint \"" + constraint + "\"", "23505"),
                        constraint));
    }
}
