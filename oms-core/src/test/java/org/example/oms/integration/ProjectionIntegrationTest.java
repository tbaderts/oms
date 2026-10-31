package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.function.Predicate;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.Order;
import org.example.common.model.msg.OrderExecution;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.OrderExecutionView;
import org.example.oms.projection.OrderExecutionProjection;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderExecutionViewRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * SPEC-0020: the order-execution projection runs in every fill's transaction. Its row for a fill
 * holds what the OrderExecution record of that fill carries, a failing projection rolls the fill
 * back, and refused fills leave no row.
 */
class ProjectionIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final String ORDER_EXECUTIONS = "oms_order_executions";

    @Autowired private OrderExecutionViewRepository viewRepository;
    @Autowired private OrderEventRepository orderEventRepository;
    @Autowired private ConsumerFactory<Object, Object> consumerFactory;
    @MockitoSpyBean private OrderExecutionProjection projection;

    // AC-1
    @Test
    void fill_writesOneViewRowMatchingItsOrderExecution() throws Exception {
        String orderId = createLiveOrder();
        postFill(orderId + "-REST1", orderId, "40", "2026-10-30T23:30:00Z");
        send(orderId, fill(orderId + "-KAFKA1", orderId, "30"));
        awaitUntil(() -> executionCount(orderId) == 2, "both fills applied");

        List<OrderExecution> published = consumeUntil(rs -> rs.size() == 2, orderId);
        assertEquals(2, published.size(), "one OrderExecution per fill");

        for (OrderExecution record : published) {
            List<OrderExecutionView> rows = viewRows(orderId).stream()
                    .filter(v -> record.getExecId().equals(v.getExecId()))
                    .toList();
            assertEquals(1, rows.size(), "one view row for " + record.getExecId());
            assertRowMatches(rows.getFirst(), record);
        }
    }

    // AC-2. The relay drains the outbox concurrently, so the rollback is proven through the event
    // version: if the failed fill had committed its event (and with it its outbox rows), the next
    // fill would be version 4, not 3.
    @Test
    void failingProjection_rollsBackTheFill() throws Exception {
        String orderId = createLiveOrder();
        Order before = orderRepository.findByOrderId(orderId).orElseThrow();
        doThrow(new IllegalStateException("projection broken"))
                .doCallRealMethod()
                .when(projection)
                .project(any());

        int status = postFill(orderId + "-FAIL", orderId, "10", null);

        assertNotEquals(201, status, "the fill is refused");
        Order after = orderRepository.findByOrderId(orderId).orElseThrow();
        assertEquals(before.getState(), after.getState(), "state");
        assertEquals(0, before.getCumQty().compareTo(after.getCumQty()), "cumQty");
        assertEquals(before.getTxNr(), after.getTxNr(), "txNr");
        assertEquals(0, executionCount(orderId), "no executions row");
        assertTrue(viewRows(orderId).isEmpty(), "no projection row");
        assertEquals(2, eventVersions(orderId).size(), "no order_events row (NEW_ORDER and ACK only)");

        assertEquals(201, postFill(orderId + "-OK", orderId, "10", null), "the next fill applies");
        assertEquals(List.of(1L, 2L, 3L), eventVersions(orderId), "the failed fill left no event version");
        assertEquals(List.of(orderId + "-OK"), viewRows(orderId).stream().map(OrderExecutionView::getExecId).toList());
    }

    // AC-3
    @Test
    void refusedFills_writeNoViewRow() throws Exception {
        String orderId = createLiveOrder();
        String execId = orderId + "-OK1";
        assertEquals(201, postFill(execId, orderId, "10", null));
        OrderExecutionView original = viewRows(orderId).getFirst();

        assertNotEquals(201, postFill(execId, orderId, "20", null), "duplicate execId refused");
        assertNotEquals(201, postFill(orderId + "-OVER", orderId, "200", null), "overfill refused");

        List<OrderExecutionView> rows = viewRows(orderId);
        assertEquals(1, rows.size(), "still one row");
        assertEquals(original.getId(), rows.getFirst().getId());
        assertEquals(0, new BigDecimal("10").compareTo(rows.getFirst().getLastQty()), "row unchanged");
        assertEquals(original.getOrderVersion(), rows.getFirst().getOrderVersion(), "row unchanged");
    }

    // --- helpers -------------------------------------------------------------------------------

    private List<OrderExecutionView> viewRows(String orderId) {
        return viewRepository.findAll().stream().filter(v -> orderId.equals(v.getOrderId())).toList();
    }

    private List<Long> eventVersions(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).stream()
                .map(OrderEvent::getVersion)
                .toList();
    }

    /** The order's OrderExecution records on the real topic, read from the earliest offset. */
    private List<OrderExecution> consumeUntil(Predicate<List<OrderExecution>> done, String orderId) {
        Properties fromStart = new Properties();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        List<OrderExecution> records = new ArrayList<>();
        try (Consumer<Object, Object> consumer =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(List.of(ORDER_EXECUTIONS));
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (!done.test(records) && System.nanoTime() < deadline) {
                for (ConsumerRecord<Object, Object> r : consumer.poll(Duration.ofMillis(200))) {
                    if (r.value() instanceof OrderExecution oe && orderId.equals(oe.getOrderId())) {
                        records.add(oe);
                    }
                }
            }
        }
        return records;
    }

    static void assertRowMatches(OrderExecutionView row, OrderExecution record) {
        String at = record.getExecId() + ": ";
        assertEquals(record.getOrderId(), row.getOrderId(), at + "orderId");
        assertEquals(record.getRootOrderId(), row.getRootOrderId(), at + "rootOrderId");
        assertEquals(record.getClOrdId(), row.getClOrdId(), at + "clOrdId");
        assertEquals(record.getSessionId(), row.getSessionId(), at + "sessionId");
        assertEquals(record.getAccount(), row.getAccount(), at + "account");
        assertEquals(record.getSide().name(), row.getSide(), at + "side");
        assertEquals(record.getSymbol(), row.getSymbol(), at + "symbol");
        assertEquals(record.getOrdType().name(), row.getOrdType(), at + "ordType");
        assertQty(record.getPrice(), row.getPrice(), at + "price");
        assertQty(record.getOrderQty(), row.getOrderQty(), at + "orderQty");
        assertQty(record.getLastQty(), row.getLastQty(), at + "lastQty");
        assertQty(record.getLastPx(), row.getLastPx(), at + "lastPx");
        assertEquals(record.getExecType(), row.getExecType(), at + "execType");
        assertEquals(record.getLastMkt(), row.getLastMkt(), at + "lastMkt");
        assertEquals(record.getTransactTime(), row.getTransactTime(), at + "transactTime");
        assertQty(record.getCumQty(), row.getCumQty(), at + "cumQty");
        assertQty(record.getLeavesQty(), row.getLeavesQty(), at + "leavesQty");
        assertEquals(record.getState().name(), row.getState(), at + "state");
        assertEquals(record.getOrderVersion(), row.getOrderVersion(), at + "orderVersion");
        assertEquals(record.getTradeDate(), row.getTradeDate(), at + "tradeDate");
    }

    private static void assertQty(BigDecimal expected, BigDecimal actual, String what) {
        if (expected == null) {
            assertEquals(null, actual, what);
            return;
        }
        assertEquals(0, expected.compareTo(actual), () -> what + ": expected " + expected + " but was " + actual);
    }
}
