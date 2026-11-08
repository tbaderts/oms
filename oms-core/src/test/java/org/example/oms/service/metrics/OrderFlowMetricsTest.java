package org.example.oms.service.metrics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;

import org.example.common.model.Side;
import org.example.common.model.State;
import org.example.oms.model.Event;
import org.example.oms.repository.OrderRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * The order-flow meters count only what was committed (SPEC-0038): a change rolled back after the
 * event was appended must not show in the numbers.
 */
class OrderFlowMetricsTest {

    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final OrderRepository orderRepository = mock(OrderRepository.class);
    private final OrderFlowMetrics metrics = new OrderFlowMetrics(registry, orderRepository);

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void recordsAfterCommitOnly() {
        TransactionSynchronizationManager.initSynchronization();
        metrics.recordEvent(Event.FILL);
        metrics.recordFill(Side.BUY, new BigDecimal("25"));

        assertEquals(0, events(Event.FILL), "nothing before commit");
        assertEquals(0, fills(Side.BUY));

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);

        assertEquals(1, events(Event.FILL));
        assertEquals(1, fills(Side.BUY));
        assertEquals(25.0, registry.get(OrderFlowMetrics.EXECUTION_QUANTITY).tag("side", "BUY").summary().totalAmount());
    }

    /** SPEC-0044: busts, corrections and whacks are counted like every other event, after commit. */
    @Test
    void executionLifecycleEventsAreCountedAfterCommit() {
        TransactionSynchronizationManager.initSynchronization();
        metrics.recordEvent(Event.EXEC_BUST);
        metrics.recordEvent(Event.EXEC_CORRECT);
        metrics.recordEvent(Event.EXEC_WHACK);

        assertEquals(0, events(Event.EXEC_BUST), "nothing before commit");

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);

        assertEquals(1, events(Event.EXEC_BUST));
        assertEquals(1, events(Event.EXEC_CORRECT));
        assertEquals(1, events(Event.EXEC_WHACK));
    }

    @Test
    void recordsNothingOnRollback() {
        TransactionSynchronizationManager.initSynchronization();
        metrics.recordEvent(Event.ACK);
        metrics.recordFill(Side.SELL, BigDecimal.TEN);

        TransactionSynchronizationManager.getSynchronizations()
                .forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

        assertEquals(0, events(Event.ACK));
        assertEquals(0, fills(Side.SELL));
    }

    @Test
    void recordsImmediatelyWithoutATransaction() {
        metrics.recordEvent(Event.NEW_ORDER);
        metrics.recordFill(Side.SELL, new BigDecimal("3.5"));

        assertEquals(1, events(Event.NEW_ORDER));
        assertEquals(1, fills(Side.SELL));
    }

    @Test
    void everySeriesExistsFromTheStart() {
        for (Event event : Event.values()) {
            assertEquals(0, events(event), event.name());
        }
        for (Side side : Side.values()) {
            assertEquals(0, fills(side), side.name());
        }
        for (State state : State.values()) {
            assertNotNull(registry.find(OrderFlowMetrics.ORDERS_BY_STATE).tag("state", state.name()).gauge(), state.name());
        }
    }

    @Test
    void ordersByStateReadsTheRepository() {
        when(orderRepository.countByState(State.LIVE)).thenReturn(7L);

        assertEquals(7.0, registry.get(OrderFlowMetrics.ORDERS_BY_STATE).tag("state", "LIVE").gauge().value());
        assertEquals(0.0, registry.get(OrderFlowMetrics.ORDERS_BY_STATE).tag("state", "NEW").gauge().value());
    }

    private double events(Event event) {
        return registry.get(OrderFlowMetrics.ORDER_EVENTS).tag("event", event.name()).counter().count();
    }

    private long fills(Side side) {
        return registry.get(OrderFlowMetrics.EXECUTION_QUANTITY).tag("side", side.name()).summary().count();
    }
}
