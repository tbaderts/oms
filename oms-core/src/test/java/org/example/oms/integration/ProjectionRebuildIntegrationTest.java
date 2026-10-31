package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.stream.Collectors;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.msg.OrderExecution;
import org.example.oms.model.OrderExecutionView;
import org.example.oms.repository.OrderExecutionViewRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.ConsumerFactory;

/**
 * SPEC-0020 AC-6: a projection rebuilt from order_events and executions holds the same rows it held
 * before, including a fill whose event was stored without its command (REST fills before SPEC-0018),
 * and the rebuild publishes nothing.
 */
class ProjectionRebuildIntegrationTest extends AbstractFillFlowIntegrationTest {

    @Autowired private OrderExecutionViewRepository viewRepository;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private ConsumerFactory<Object, Object> consumerFactory;

    @Test
    void rebuild_reproducesTheViewWithoutPublishing() throws Exception {
        String orderA = createLiveOrder();
        String orderB = createLiveOrder();
        assertEquals(201, postFill(orderA + "-1", orderA, "10", "2026-10-31T10:00:00Z"));
        assertEquals(201, postFill(orderA + "-2", orderA, "20", null));
        assertEquals(201, postFill(orderB + "-1", orderB, "30", "2026-10-31T11:00:00Z"));
        List<String> orders = List.of(orderA, orderB);
        assertEquals(3, consumeOrderExecutions(orders, 3).size(), "all three fills published");
        Map<String, List<Object>> before = rows(orders);
        assertEquals(3, before.size());

        // The second fill of A as a REST fill recorded before SPEC-0018: no stored command.
        assertEquals(1, jdbcTemplate.update(
                "update order_events set transaction = null where order_id = ? and version = 4", orderA));

        mockMvc().perform(post("/actuator/projections/order_execution_view/rebuild"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projection").value("order_execution_view"))
                .andExpect(jsonPath("$.rows").value((int) viewRepository.count()));

        assertEquals(before, rows(orders), "the rebuilt rows equal the projected ones");

        // A later fill on each order is published after anything the rebuild could have staged, on
        // the same partitions; only the three fills and the two sentinels may be on the topic.
        assertEquals(201, postFill(orderA + "-S", orderA, "10", null));
        assertEquals(201, postFill(orderB + "-S", orderB, "10", null));
        List<String> published = consumeOrderExecutions(orders, 5).stream().map(OrderExecution::getExecId).sorted().toList();
        assertEquals(
                List.of(orderA + "-1", orderA + "-2", orderA + "-S", orderB + "-1", orderB + "-S").stream().sorted().toList(),
                published,
                "the rebuild published nothing");
    }

    @Test
    void unknownProjection_is404() throws Exception {
        mockMvc().perform(post("/actuator/projections/no_such_view/rebuild")).andExpect(status().isNotFound());
    }

    /** The orders' view rows by (orderId, execId), every column except the surrogate id and projectedAt. */
    private Map<String, List<Object>> rows(List<String> orders) {
        return viewRepository.findAll().stream()
                .filter(v -> orders.contains(v.getOrderId()))
                .collect(Collectors.toMap(v -> v.getOrderId() + "/" + v.getExecId(), ProjectionRebuildIntegrationTest::columns));
    }

    private static List<Object> columns(OrderExecutionView v) {
        return java.util.Arrays.asList(
                v.getOrderId(), v.getExecId(), v.getRootOrderId(), v.getParentOrderId(), v.getLeg(), v.getClOrdId(),
                v.getSessionId(), v.getAccount(), v.getSide(), v.getSymbol(), v.getSecurityId(), v.getOrdType(),
                plain(v.getPrice()), plain(v.getOrderQty()), v.getSettlCurrency(), v.getExDestination(),
                plain(v.getLastQty()), plain(v.getLastPx()), v.getExecType(), v.getLastCapacity(), v.getLastMkt(),
                v.getTransactTime(), plain(v.getCumQty()), plain(v.getLeavesQty()), plain(v.getAvgPx()), v.getState(),
                v.getOrderVersion(), v.getTradeDate());
    }

    private static Object plain(java.math.BigDecimal value) {
        return value == null ? null : value.stripTrailingZeros().toPlainString();
    }

    private List<OrderExecution> consumeOrderExecutions(List<String> orders, int expected) {
        Properties fromStart = new Properties();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        List<OrderExecution> records = new ArrayList<>();
        try (Consumer<Object, Object> consumer =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(List.of("oms_order_executions"));
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (records.size() < expected && System.nanoTime() < deadline) {
                for (ConsumerRecord<Object, Object> r : consumer.poll(Duration.ofMillis(200))) {
                    if (r.value() instanceof OrderExecution oe && orders.contains(oe.getOrderId())) {
                        records.add(oe);
                    }
                }
            }
            // Read on briefly after reaching the count, so an extra record would be seen too.
            long settle = System.nanoTime() + Duration.ofSeconds(1).toNanos();
            while (System.nanoTime() < settle) {
                for (ConsumerRecord<Object, Object> r : consumer.poll(Duration.ofMillis(200))) {
                    if (r.value() instanceof OrderExecution oe && orders.contains(oe.getOrderId())) {
                        records.add(oe);
                    }
                }
            }
        }
        assertTrue(records.size() >= expected, "expected at least " + expected + " records, got " + records.size());
        return records;
    }
}
