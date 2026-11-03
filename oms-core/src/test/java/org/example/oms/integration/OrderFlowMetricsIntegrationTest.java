package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.EnumMap;
import java.util.Map;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderCancelCmd;
import org.example.oms.model.Event;
import org.example.oms.service.metrics.OrderFlowMetrics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * The order-flow metrics count exactly what the event log records (SPEC-0038 AC-1 to AC-3): one per
 * appended event, nothing for a refused command, and the orders table as it is.
 *
 * <p>The registry is shared with the other integration tests of this context, so every check is a
 * difference between two readings around this test's own actions.
 */
class OrderFlowMetricsIntegrationTest extends AbstractFillFlowIntegrationTest {

    @Autowired MeterRegistry meterRegistry;

    @Test
    void eventsAreCountedOncePerAppendedEvent() throws Exception {
        Map<Event, Double> before = events();

        String orderId = createLiveOrder();
        assertEquals(201, postFill(orderId + "-E1", orderId, "60", null));
        assertEquals(201, postFill(orderId + "-E2", orderId, "40", null));
        awaitUntil(() -> state(orderId) == State.FILLED, orderId + " FILLED");

        Map<Event, Double> delta = delta(before, events());
        for (Event event : Event.values()) {
            double expected = switch (event) {
                case NEW_ORDER, ACK, PARTIAL_FILL, FILL -> 1.0;
                default -> 0.0;
            };
            assertEquals(expected, delta.get(event), event.name());
        }
    }

    @Test
    void refusedCommandsAreNotCounted() throws Exception {
        String orderId = createLiveOrder();
        assertEquals(201, postFill(orderId + "-E1", orderId, "10", null));
        Map<Event, Double> before = events();
        double refusedAccepts = consumed("OrderAcceptCmd", "refused");

        // An accept for a LIVE order is an illegal transition; a fill with a known execId a duplicate.
        send(orderId, new OrderAcceptCmd(TestCommands.header(), orderId));
        awaitUntil(() -> consumed("OrderAcceptCmd", "refused") > refusedAccepts, "the second accept refused");
        assertNotEquals(201, postFill(orderId + "-E1", orderId, "10", null), "duplicate execId refused");

        assertEquals(before, events(), "no event counted for refused commands");
    }

    @Test
    void ordersByStateMatchesTheOrdersTable() throws Exception {
        // At least one order each in LIVE, FILLED and CXL; none is ever stored in NEW.
        createLiveOrder();
        String filled = createLiveOrder();
        assertEquals(201, postFill(filled + "-E1", filled, "100", null));
        String cancelled = createLiveOrder();
        send(cancelled, new OrderCancelCmd(TestCommands.header(), cancelled, "metrics test"));
        awaitUntil(() -> state(cancelled) == State.CXL, cancelled + " CXL");

        Map<State, Long> rows = new EnumMap<>(State.class);
        for (State state : State.values()) {
            rows.put(state, 0L);
        }
        orderRepository.findAll().stream().map(Order::getState).forEach(s -> rows.merge(s, 1L, Long::sum));

        assertTrue(rows.get(State.LIVE) > 0 && rows.get(State.FILLED) > 0 && rows.get(State.CXL) > 0, rows.toString());
        assertEquals(0L, rows.get(State.NEW), "no order is stored in NEW");
        for (State state : State.values()) {
            double gauge = meterRegistry.get(OrderFlowMetrics.ORDERS_BY_STATE).tag("state", state.name()).gauge().value();
            assertEquals(rows.get(state).doubleValue(), gauge, state.name());
        }
    }

    @Test
    void fillQuantityIsRecordedPerSide() throws Exception {
        String orderId = createLiveOrder(); // a BUY order
        long fills = buyFills();
        double total = buyQuantity();

        assertEquals(201, postFill(orderId + "-E1", orderId, "25", null));
        assertEquals(fills + 1, buyFills());
        assertEquals(total + 25.0, buyQuantity(), 1e-9);

        assertNotEquals(201, postFill(orderId + "-E1", orderId, "25", null), "duplicate execId refused");
        assertEquals(fills + 1, buyFills(), "a duplicate fill is not recorded");
        assertEquals(total + 25.0, buyQuantity(), 1e-9);
    }

    @Test
    void endOfDaySeriesExistAtStartup() {
        for (String step : new String[] {"expire", "close"}) {
            for (String name : new String[] {"oms.end-of-day.orders", "oms.end-of-day.failures"}) {
                assertNotNull(meterRegistry.find(name).tag("step", step).counter(), name + "{step=" + step + "}");
            }
        }
    }

    private Map<Event, Double> events() {
        Map<Event, Double> counts = new EnumMap<>(Event.class);
        for (Event event : Event.values()) {
            counts.put(event, meterRegistry.get(OrderFlowMetrics.ORDER_EVENTS).tag("event", event.name()).counter().count());
        }
        return counts;
    }

    private static Map<Event, Double> delta(Map<Event, Double> before, Map<Event, Double> after) {
        Map<Event, Double> delta = new EnumMap<>(Event.class);
        before.forEach((event, count) -> delta.put(event, after.get(event) - count));
        return delta;
    }

    private double consumed(String type, String outcome) {
        var counter = meterRegistry.find("oms.commands.consumed").tag("type", type).tag("outcome", outcome).counter();
        return counter == null ? 0 : counter.count();
    }

    private long buyFills() {
        return meterRegistry.get(OrderFlowMetrics.EXECUTION_QUANTITY).tag("side", "BUY").summary().count();
    }

    private double buyQuantity() {
        return meterRegistry.get(OrderFlowMetrics.EXECUTION_QUANTITY).tag("side", "BUY").summary().totalAmount();
    }
}
