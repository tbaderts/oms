package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.function.Predicate;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.msg.ExecutionCreateCmd;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderCreateCmd;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.model.OrderExecutionView;
import org.example.oms.repository.OrderExecutionViewRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.ConsumerFactory;

import com.jayway.jsonpath.JsonPath;

/**
 * SPEC-0039 AC-5, AC-6: a value with 8 decimal places is carried exactly, unrounded, through every
 * layer: the command API and the commands topic, the order, execution and projection tables, the
 * query API, and the three outbound topics.
 */
class DecimalPrecisionIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final BigDecimal PRICE = new BigDecimal("170.12345678");
    private static final BigDecimal ORDER_QTY = new BigDecimal("100.12345678");
    private static final BigDecimal REST_QTY = new BigDecimal("0.12345678");
    private static final BigDecimal KAFKA_QTY = new BigDecimal("0.00000001");

    @Autowired private OrderExecutionViewRepository viewRepository;
    @Autowired private ConsumerFactory<Object, Object> consumerFactory;

    // AC-5
    @Test
    void eightDecimalsSurviveEveryLayer() throws Exception {
        String orderId = createOverRest();
        send(orderId, new OrderAcceptCmd(TestCommands.header(), orderId));
        awaitUntil(() -> state(orderId) == State.LIVE, orderId + " LIVE");

        String restExec = orderId + "-R";
        String kafkaExec = orderId + "-K";
        assertEquals(201, postFill(restExec, orderId, REST_QTY.toPlainString(), null, PRICE.toPlainString()));
        send(orderId, kafkaFill(kafkaExec, orderId, KAFKA_QTY));
        awaitUntil(() -> executionCount(orderId) == 2, "both fills applied");

        BigDecimal cum = REST_QTY.add(KAFKA_QTY);
        BigDecimal leaves = ORDER_QTY.subtract(cum);

        Order order = orderRepository.findByOrderId(orderId).orElseThrow();
        assertExact(PRICE, order.getPrice(), "orders.price");
        assertExact(ORDER_QTY, order.getOrderQty(), "orders.order_qty");
        assertExact(cum, order.getCumQty(), "orders.cum_qty");
        assertExact(leaves, order.getLeavesQty(), "orders.leaves_qty");

        // The REST fill is applied first, so its cumulative and remaining quantities are known.
        BigDecimal restLeaves = ORDER_QTY.subtract(REST_QTY);
        for (Execution e : executionRepository.findAll().stream().filter(e -> orderId.equals(e.getOrderId())).toList()) {
            boolean rest = e.getExecId().equals(restExec);
            assertExact(PRICE, e.getLastPx(), "executions.last_px");
            assertExact(rest ? REST_QTY : KAFKA_QTY, e.getLastQty(), "executions.last_qty");
            assertExact(rest ? REST_QTY : cum, e.getCumQty(), "executions.cum_qty");
            assertExact(rest ? restLeaves : leaves, e.getLeavesQty(), "executions.leaves_qty");
        }
        for (OrderExecutionView v : viewRepository.findAll().stream().filter(v -> orderId.equals(v.getOrderId())).toList()) {
            boolean rest = v.getExecId().equals(restExec);
            assertExact(PRICE, v.getLastPx(), "view.last_px");
            assertExact(PRICE, v.getPrice(), "view.price");
            assertExact(ORDER_QTY, v.getOrderQty(), "view.order_qty");
            assertExact(rest ? REST_QTY : KAFKA_QTY, v.getLastQty(), "view.last_qty");
            assertExact(rest ? REST_QTY : cum, v.getCumQty(), "view.cum_qty");
            assertExact(rest ? restLeaves : leaves, v.getLeavesQty(), "view.leaves_qty");
        }

        String search = mockMvc().perform(get("/api/query/search").param("orderId", orderId))
                .andReturn().getResponse().getContentAsString();
        assertTrue(search.contains("\"price\":170.12345678"), search);
        assertTrue(search.contains("\"cumQty\":" + cum.toPlainString()), search);
        assertTrue(search.contains("\"leavesQty\":" + leaves.toPlainString()), search);

        List<Object> published = consume(rs -> rs.stream().filter(r -> r instanceof OrderMessage).count() >= 4
                && rs.stream().filter(r -> r instanceof OrderExecution).count() == 2
                && rs.stream().filter(r -> r instanceof org.example.common.model.msg.Execution).count() == 2, orderId);
        OrderMessage last = published.stream()
                .filter(r -> r instanceof OrderMessage).map(r -> (OrderMessage) r)
                .max(java.util.Comparator.comparing(OrderMessage::getEventId)).orElseThrow();
        assertExact(PRICE, last.getPrice(), "oms_orders price");
        assertExact(ORDER_QTY, last.getOrderQty(), "oms_orders orderQty");
        assertExact(cum, last.getCumQty(), "oms_orders cumQty");
        assertExact(leaves, last.getLeavesQty(), "oms_orders leavesQty");
        published.stream().filter(r -> r instanceof org.example.common.model.msg.Execution)
                .map(r -> (org.example.common.model.msg.Execution) r)
                .forEach(e -> {
                    assertExact(PRICE, e.getLastPx(), "oms_executions lastPx");
                    assertExact(e.getExecId().equals(restExec) ? REST_QTY : KAFKA_QTY, e.getLastQty(), "oms_executions lastQty");
                });
        published.stream().filter(r -> r instanceof OrderExecution).map(r -> (OrderExecution) r)
                .forEach(oe -> {
                    assertExact(PRICE, oe.getLastPx(), "oms_order_executions lastPx");
                    assertExact(PRICE, oe.getPrice(), "oms_order_executions price");
                    assertExact(oe.getExecId().equals(restExec) ? REST_QTY : KAFKA_QTY, oe.getLastQty(), "oms_order_executions lastQty");
                });
    }

    // AC-6
    @Test
    void kafkaOrderCreateKeepsEightDecimals() throws Exception {
        String clOrdId = "CL-" + UUID.randomUUID();
        var order = org.example.common.model.msg.Order.newBuilder()
                .setClOrdId(clOrdId)
                .setSessionId("SES-PREC")
                .setAccount("ACC-PREC")
                .setSymbol("AAPL")
                .setSide(org.example.common.model.msg.Side.BUY)
                .setOrdType(org.example.common.model.msg.OrdType.LIMIT)
                .setPrice(PRICE)
                .setOrderQty(ORDER_QTY)
                .build();
        send(clOrdId, new OrderCreateCmd(TestCommands.header(), order));

        awaitUntil(() -> orderRepository.findAll().stream().anyMatch(o -> clOrdId.equals(o.getClOrdId())), "order created");
        Order created = orderRepository.findAll().stream().filter(o -> clOrdId.equals(o.getClOrdId())).findFirst().orElseThrow();
        assertExact(PRICE, created.getPrice(), "orders.price");
        assertExact(ORDER_QTY, created.getOrderQty(), "orders.order_qty");

        OrderMessage message = (OrderMessage) consume(rs -> rs.stream().anyMatch(r -> r instanceof OrderMessage), created.getOrderId())
                .stream().filter(r -> r instanceof OrderMessage).findFirst().orElseThrow();
        assertExact(PRICE, message.getPrice(), "oms_orders price");
    }

    // --- helpers -------------------------------------------------------------------------------

    private String createOverRest() throws Exception {
        String body = "{\"type\":\"OrderCreateCmd\",\"version\":\"3.0.0\",\"order\":{\"sessionId\":\"SES-PREC\","
                + "\"clOrdId\":\"CL-" + UUID.randomUUID() + "\",\"account\":\"ACC-PREC\",\"symbol\":\"AAPL\","
                + "\"side\":\"BUY\",\"ordType\":\"LIMIT\",\"timeInForce\":\"DAY\","
                + "\"price\":" + PRICE.toPlainString() + ",\"orderQty\":" + ORDER_QTY.toPlainString() + "}}";
        var response = mockMvc().perform(post("/api/command/execute").contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse();
        assertEquals(201, response.getStatus(), response.getContentAsString());
        String orderId = JsonPath.read(response.getContentAsString(), "$.id");
        assertNotNull(orderId);
        return orderId;
    }

    private static ExecutionCreateCmd kafkaFill(String execId, String orderId, BigDecimal lastQty) {
        var execution = org.example.common.model.msg.Execution.newBuilder()
                .setExecId(execId)
                .setOrderId(orderId)
                .setLastQty(lastQty)
                .setLastPx(PRICE)
                .setExecType("F")
                .setLastMkt("XSIM")
                .setTransactTime(Instant.now())
                .build();
        return new ExecutionCreateCmd(TestCommands.header(), execution);
    }

    /** The order's records on the three outbound topics, from the earliest offset. */
    private List<Object> consume(Predicate<List<Object>> done, String orderId) {
        Properties fromStart = TestCommands.avroValues();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        List<Object> records = new ArrayList<>();
        try (Consumer<Object, Object> consumer =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(List.of("orders", "oms_executions", "oms_order_executions"));
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (!done.test(records) && System.nanoTime() < deadline) {
                for (ConsumerRecord<Object, Object> r : consumer.poll(Duration.ofMillis(200))) {
                    Object v = r.value();
                    if ((v instanceof OrderMessage m && orderId.equals(m.getOrderId()))
                            || (v instanceof org.example.common.model.msg.Execution e && orderId.equals(e.getOrderId()))
                            || (v instanceof OrderExecution oe && orderId.equals(oe.getOrderId()))) {
                        records.add(v);
                    }
                }
            }
        }
        return records;
    }

    /** Equal in value; a rounded value (e.g. 0.1235 for 0.12345678) fails. */
    private static void assertExact(BigDecimal expected, BigDecimal actual, String what) {
        assertNotNull(actual, what);
        assertEquals(0, expected.compareTo(actual), () -> what + ": expected " + expected.toPlainString() + " but was " + actual.toPlainString());
    }
}
