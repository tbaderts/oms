package org.example.oms.service.metrics;

import java.math.BigDecimal;
import java.util.EnumMap;
import java.util.Map;

import org.example.common.model.Side;
import org.example.common.model.State;
import org.example.oms.model.Event;
import org.example.oms.repository.OrderRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;

/**
 * What the OMS does with orders, as metrics (SPEC-0038): the order events appended, the orders in
 * each state, and the quantity filled.
 *
 * <p>Events and fills are recorded after the transaction that appended them commits. A change rolled
 * back later in its pipeline, or by a concurrent writer, never shows. Every series is registered at
 * startup with 0, so dashboards and {@code rate()} have data from the first export; the label sets
 * are the enum values and stay small.
 */
@Component
public class OrderFlowMetrics {

    /** Order events appended to {@code order_events}, by {@link Event}. */
    public static final String ORDER_EVENTS = "oms.order.events";

    /** Orders currently in each {@link State}, read from {@code orders}. */
    public static final String ORDERS_BY_STATE = "oms.orders.by_state";

    /** Quantity of each fill, by the order's {@link Side}: count is fills, total is quantity. */
    public static final String EXECUTION_QUANTITY = "oms.executions.quantity";

    private final Map<Event, Counter> events = new EnumMap<>(Event.class);
    private final Map<Side, DistributionSummary> fills = new EnumMap<>(Side.class);

    public OrderFlowMetrics(MeterRegistry meterRegistry, OrderRepository orderRepository) {
        for (Event event : Event.values()) {
            events.put(event, Counter.builder(ORDER_EVENTS)
                    .description("Order events appended to the event log")
                    .tag("event", event.name())
                    .register(meterRegistry));
        }
        for (Side side : Side.values()) {
            fills.put(side, DistributionSummary.builder(EXECUTION_QUANTITY)
                    .description("Quantity of each fill")
                    .baseUnit("shares")
                    .tag("side", side.name())
                    .register(meterRegistry));
        }
        for (State state : State.values()) {
            Gauge.builder(ORDERS_BY_STATE, orderRepository, repository -> repository.countByState(state))
                    .description("Orders currently in this state")
                    .tag("state", state.name())
                    .register(meterRegistry);
        }
    }

    /** Counts one appended order event, once its transaction commits. */
    public void recordEvent(Event event) {
        afterCommit(() -> events.get(event).increment());
    }

    /** Records one fill of {@code quantity} for an order on {@code side}, once its transaction commits. */
    public void recordFill(Side side, BigDecimal quantity) {
        if (side == null || quantity == null) {
            return;
        }
        afterCommit(() -> fills.get(side).record(quantity.doubleValue()));
    }

    private static void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
