package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.function.Predicate;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.OrderExecution;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.ConsumerFactory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * SPEC-0041: what the executions blotter reads. Fills are named by execId on every feed, and each
 * carries the order's volume-weighted average price as of that fill.
 */
class ExecutionBlotterIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final String EXECUTIONS = "oms_executions";
    private static final String ORDER_EXECUTIONS = "oms_order_executions";

    private static final ObjectMapper JSON = JsonMapper.builder().build();

    @Autowired private ConsumerFactory<Object, Object> consumerFactory;

    // AC-1
    @Test
    void metamodelEndpointServesExecIdPrimaryKey() throws Exception {
        JsonNode metamodel = getJson("/api/v1/metamodel/Execution");

        assertEquals("execId", metamodel.get("primaryKey").asString());
        List<String> fields = new ArrayList<>();
        metamodel.get("fields").forEach(f -> fields.add(f.get("name").asString()));
        assertFalse(fields.contains("execID"), "no execID field");
        assertFalse(fields.contains("executionId"), "no executionId field");
        List<String> defaults = new ArrayList<>();
        metamodel.get("defaultColumns").forEach(c -> defaults.add(c.asString()));
        assertTrue(fields.containsAll(defaults), "every default column is a field: " + defaults);
        assertTrue(defaults.containsAll(List.of("execId", "orderId", "avgPx")), defaults.toString());
    }

    // AC-2
    @Test
    void restExecutionsCarryExecIdAndAvgPx() throws Exception {
        String orderId = createLiveOrder();
        applyTwoFills(orderId);

        Map<String, JsonNode> rows = restRows(orderId);
        assertEquals(2, rows.size(), "both fills listed");
        for (JsonNode row : rows.values()) {
            for (String field : List.of("id", "execId", "orderId", "avgPx")) {
                assertTrue(row.hasNonNull(field), field + " present in " + row);
            }
            assertFalse(row.has("execID"), "no execID in " + row);
            assertFalse(row.has("executionId"), "no executionId in " + row);
        }
        assertPrice("10", rows.get(orderId + "-1").get("avgPx").decimalValue());
        assertPrice("10.6", rows.get(orderId + "-2").get("avgPx").decimalValue());
    }

    // AC-3
    @Test
    void avgPxReachesProjectionAndMessages() throws Exception {
        String orderId = createLiveOrder();
        applyTwoFills(orderId);

        JsonNode view = getJson("/api/query/executions?orderId=" + orderId);
        assertEquals(2, view.size());
        assertEquals(orderId + "-1", view.get(0).get("execId").asString());
        assertPrice("10", view.get(0).get("avgPx").decimalValue());
        assertPrice("10.6", view.get(1).get("avgPx").decimalValue());

        List<ConsumerRecord<Object, Object>> records = consumeUntil(
                List.of(EXECUTIONS, ORDER_EXECUTIONS),
                rs -> avgPxByExecId(rs, orderId, Execution.class).size() == 2
                        && avgPxByExecId(rs, orderId, OrderExecution.class).size() == 2);

        for (Class<?> type : List.of(Execution.class, OrderExecution.class)) {
            Map<String, BigDecimal> avgPx = avgPxByExecId(records, orderId, type);
            assertEquals(2, avgPx.size(), type.getSimpleName() + " messages of " + orderId);
            assertPrice("10", avgPx.get(orderId + "-1"));
            assertPrice("10.6", avgPx.get(orderId + "-2"));
        }
    }

    // AC-4
    @Test
    void duplicateFillDoesNotChangeAvgPx() throws Exception {
        String orderId = createLiveOrder();
        postFill(orderId + "-1", orderId, "40", null, "10");
        awaitUntil(() -> executionCount(orderId) == 1, "first fill applied");
        // Redelivered while the order is still LIVE, so the idempotency check is what refuses it.
        postFill(orderId + "-1", orderId, "40", null, "10");
        postFill(orderId + "-2", orderId, "60", null, "11");
        awaitUntil(() -> executionCount(orderId) == 2, "second fill applied");
        // And the second fill again, after the order is filled.
        postFill(orderId + "-2", orderId, "60", null, "11");

        assertEquals(2, executionCount(orderId), "no extra execution row");
        Map<String, JsonNode> rows = restRows(orderId);
        assertPrice("10", rows.get(orderId + "-1").get("avgPx").decimalValue());
        assertPrice("10.6", rows.get(orderId + "-2").get("avgPx").decimalValue());
    }

    /** AC-2's scenario: an order of 100 filled 40 @ 10, then 60 @ 11. */
    private void applyTwoFills(String orderId) throws Exception {
        assertEquals(201, postFill(orderId + "-1", orderId, "40", null, "10"));
        assertEquals(201, postFill(orderId + "-2", orderId, "60", null, "11"));
        awaitUntil(() -> executionCount(orderId) == 2, "both fills applied");
    }

    /** The order's rows from the REST executions feed, by execId. */
    private Map<String, JsonNode> restRows(String orderId) throws Exception {
        JsonNode page = getJson("/api/executions?size=500&sort=id,desc");
        Map<String, JsonNode> rows = new HashMap<>();
        page.get("content").forEach(row -> {
            if (orderId.equals(row.path("orderId").asString(null))) {
                rows.put(row.path("execId").asString(null), row);
            }
        });
        return rows;
    }

    private JsonNode getJson(String uri) throws Exception {
        String body = mockMvc().perform(get(uri)).andReturn().getResponse().getContentAsString();
        return JSON.readTree(body);
    }

    private static Map<String, BigDecimal> avgPxByExecId(
            List<ConsumerRecord<Object, Object>> records, String orderId, Class<?> type) {
        Map<String, BigDecimal> avgPx = new HashMap<>();
        for (ConsumerRecord<Object, Object> record : records) {
            if (record.value() instanceof Execution e && type == Execution.class
                    && orderId.equals(e.getOrderId())) {
                avgPx.put(e.getExecId(), e.getAvgPx());
            } else if (record.value() instanceof OrderExecution oe && type == OrderExecution.class
                    && orderId.equals(oe.getOrderId())) {
                avgPx.put(oe.getExecId(), oe.getAvgPx());
            }
        }
        return avgPx;
    }

    /** Reads the topics from the earliest offset until {@code done} holds for everything read so far. */
    private List<ConsumerRecord<Object, Object>> consumeUntil(
            List<String> topics, Predicate<List<ConsumerRecord<Object, Object>>> done) {
        Properties fromStart = TestCommands.avroValues();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        List<ConsumerRecord<Object, Object>> records = new ArrayList<>();
        try (Consumer<Object, Object> consumer =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(topics);
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (!done.test(records) && System.nanoTime() < deadline) {
                consumer.poll(Duration.ofMillis(200)).forEach(records::add);
            }
        }
        return records;
    }

    private static void assertPrice(String expected, BigDecimal actual) {
        assertTrue(actual != null && new BigDecimal(expected).compareTo(actual) == 0,
                "expected avgPx " + expected + " but was " + actual);
    }
}
