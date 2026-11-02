package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Properties;
import java.util.UUID;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.OrderEventRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.ConsumerFactory;

/**
 * SPEC-0029 AC-2 and AC-3: expire and close, over REST and Kafka, through the lifecycle pipeline —
 * each an event, a published order and a refusal where the state machine allows no move.
 */
class OrderExpiryCloseIntegrationTest extends AbstractFillFlowIntegrationTest {

    @Autowired OrderEventRepository orderEventRepository;
    @Autowired ConsumerFactory<Object, Object> consumerFactory;

    // AC-2
    @Test
    void expireOverRestAndKafka() throws Exception {
        String overRest = createLiveOrder();
        assertEquals(201, postFill(overRest + "-F1", overRest, "40", null));

        assertEquals(200, lifecycle("OrderExpireCmd", overRest, "EXP-1", "Time in force expired"));
        Order expired = order(overRest);
        assertEquals(State.EXP, expired.getState());
        assertEquals(0, BigDecimal.ZERO.compareTo(expired.getLeavesQty()));
        assertEquals(0, new BigDecimal("40").compareTo(expired.getCumQty()));
        assertEquals(Event.EXP, lastEvent(overRest).getEvent());
        assertTrue(published(overRest, org.example.common.model.msg.State.EXP), "OrderMessage with state EXP on orders");
        assertTrue(eventLog(overRest).contains("\"EXP\""), "the query API's event log shows EXP");

        assertTrue(postFill(overRest + "-F2", overRest, "10", null) >= 400, "a fill on an expired order is refused");
        assertEquals(400, lifecycle("OrderExpireCmd", overRest, "EXP-2", null), "an expired order cannot expire again");
        assertEquals(400, lifecycle("OrderExpireCmd", overRest, "EXP-1", null), "a repeated commandId is refused");

        String overKafka = createLiveOrder();
        send(overKafka, new org.example.common.model.msg.OrderExpireCmd(TestCommands.header(), overKafka, "Venue expiry"));
        awaitUntil(() -> state(overKafka) == State.EXP, overKafka + " expired over Kafka");
        assertEquals(Event.EXP, lastEvent(overKafka).getEvent());
    }

    // AC-3
    @Test
    void closeLiveAndFinishedOrders() throws Exception {
        String live = createLiveOrder();
        assertEquals(201, postFill(live + "-F1", live, "40", null));
        assertEquals(200, lifecycle("OrderCloseCmd", live, null, "Closed by operations"));
        Order closedLive = order(live);
        assertEquals(State.CLOSED, closedLive.getState());
        assertEquals(0, BigDecimal.ZERO.compareTo(closedLive.getLeavesQty()));
        assertEquals(0, new BigDecimal("40").compareTo(closedLive.getCumQty()));
        assertEquals(Event.CLOSE, lastEvent(live).getEvent());
        assertEquals("Closed by operations", lastEvent(live).getTransaction() instanceof org.example.common.model.cmd.OrderCloseCmd c ? c.getText() : null,
                "the reason is recorded with the event");
        assertTrue(published(live, org.example.common.model.msg.State.CLOSED), "OrderMessage with state CLOSED on orders");

        String filled = createLiveOrder();
        assertEquals(201, postFill(filled + "-F1", filled, "100", null));
        assertEquals(200, lifecycle("OrderCloseCmd", filled, null, "End of day"));
        assertEquals(State.CLOSED, state(filled));
        assertEquals(0, new BigDecimal("100").compareTo(order(filled).getCumQty()), "quantities unchanged");

        String kafkaClosed = createLiveOrder();
        send(kafkaClosed, new org.example.common.model.msg.OrderCloseCmd(TestCommands.header(), kafkaClosed, null));
        awaitUntil(() -> state(kafkaClosed) == State.CLOSED, kafkaClosed + " closed over Kafka");

        assertEquals(400, lifecycle("OrderCloseCmd", live, null, null), "a closed order cannot close again");
    }

    // ----------------------------------------------------------------------------------------

    private int lifecycle(String type, String orderId, String commandId, String text) throws Exception {
        String body = "{\"type\":\"" + type + "\",\"version\":\"1.0.0\",\"orderId\":\"" + orderId + "\""
                + (commandId != null ? ",\"commandId\":\"" + commandId + "-" + orderId + "\"" : "")
                + (text != null ? ",\"text\":\"" + text + "\"" : "")
                + "}";
        return mockMvc().perform(post("/api/command/execute").contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse().getStatus();
    }

    private Order order(String orderId) {
        return orderRepository.findByOrderId(orderId).orElseThrow();
    }

    private OrderEvent lastEvent(String orderId) {
        return orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).getLast();
    }

    private String eventLog(String orderId) throws Exception {
        return mockMvc().perform(get("/api/query/orders/" + orderId + "/events"))
                .andReturn().getResponse().getContentAsString();
    }

    private boolean published(String orderId, org.example.common.model.msg.State state) {
        Properties fromStart = TestCommands.avroValues();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        try (Consumer<Object, Object> consumer =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(List.of("orders"));
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (System.nanoTime() < deadline) {
                for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(200))) {
                    if (record.value() instanceof OrderMessage message
                            && orderId.equals(message.getOrderId()) && message.getState() == state) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
