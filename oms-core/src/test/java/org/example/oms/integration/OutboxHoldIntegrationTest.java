package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.UUID;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.Order;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.ConsumerFactory;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0026 AC-4 and AC-5: a row that exhausted its attempts holds the later rows of its aggregate
 * (topic and key) in the outbox, while every other aggregate is published; the oldest-age gauge
 * shows how long the held row has waited.
 */
class OutboxHoldIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final String ORDERS = "orders";

    @Autowired OutboxRepository outboxRepository;
    @Autowired OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;
    @Autowired ConsumerFactory<Object, Object> consumerFactory;
    @Autowired MeterRegistry meterRegistry;
    @Value("${kafka.outbox.max-attempts}") int maxAttempts;

    private String heldOrderId;

    @AfterEach
    void releaseTheHeldAggregate() {
        if (heldOrderId != null) {
            outboxRepository.findAll().stream()
                    .filter(row -> heldOrderId.equals(row.getAggregateId()))
                    .forEach(outboxRepository::delete);
        }
    }

    @Test
    void rowsBehindAStuckRowAreHeld() throws Exception {
        String held = holdAnAggregate();

        // Another order goes through as usual.
        String other = createUnackOrder();
        awaitUntil(() -> rowsOf(other).isEmpty(), "the other order published");
        assertTrue(ordersMessages(other, Duration.ofSeconds(10)).stream().anyMatch(m -> m.getEventId() == 1L),
                "the other order's message reached " + ORDERS);

        // The held order's accept stays in the outbox, unattempted, and never reaches the topic.
        List<OutboxMessage> heldRows = rowsOf(held);
        assertEquals(2, heldRows.size(), "the stuck row and the accept behind it: " + heldRows);
        OutboxMessage accept = heldRows.stream().filter(row -> row.getAttempts() < maxAttempts).findFirst().orElseThrow();
        assertEquals(0, accept.getAttempts(), "the held row was never attempted");
        assertTrue(ordersMessages(held, Duration.ofSeconds(2)).stream().noneMatch(m -> m.getEventId() == 2L),
                "the accept of the held order must not be published past the stuck row");
        assertTrue(meterRegistry.get("oms.outbox.stuck").gauge().value() >= 1, "the stuck row is counted");
    }

    @Test
    void oldestAgeGaugeReportsTheHeldRow() throws Exception {
        holdAnAggregate();
        Thread.sleep(1_100);

        double age = meterRegistry.get("oms.outbox.oldest.age").gauge().value();
        assertTrue(age >= 1.0, "the held row has waited over a second: " + age);
        assertTrue(age < 3_600, "the hour-old stuck row is not counted: " + age);
        String prometheus = mockMvc().perform(get("/actuator/prometheus")).andReturn().getResponse().getContentAsString();
        assertTrue(prometheus.contains("oms_outbox_oldest_age_seconds"), "exposed on /actuator/prometheus");
    }

    /**
     * Creates an order and lets it publish, then plants a row for it on {@value #ORDERS} that has
     * exhausted its attempts, and accepts the order, staging a later row of the same aggregate.
     *
     * @return the held order's id
     */
    private String holdAnAggregate() throws Exception {
        String orderId = createUnackOrder();
        heldOrderId = orderId;
        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the new order published");
        Order order = orderRepository.findByOrderId(orderId).orElseThrow();

        outboxRepository.save(OutboxMessage.builder()
                .aggregateType(OutboxMessage.AggregateType.ORDER)
                .aggregateId(orderId)
                .topic(ORDERS)
                .aggregateVersion(1L)
                .orderPayload(order)
                // An hour old: the age gauge must ignore it, as it is no longer to be published.
                .createdAt(Instant.now().minus(Duration.ofHours(1)))
                .attempts(maxAttempts)
                .lastError("planted: exhausted its attempts")
                .build());

        var accepted = orderLifecycleCommandProcessor.process(
                new OrderAcceptCmd().orderId(orderId).type("OrderAcceptCmd"), Instant.now());
        assertTrue(accepted.isSuccess(), accepted.getErrorMessage());
        return orderId;
    }

    private String createUnackOrder() {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID())
                .sessionId("SES-HOLD")
                .account("ACC-HOLD")
                .symbol("AAPL")
                .side(Side.BUY)
                .ordType(OrdType.LIMIT)
                .price(new BigDecimal("170"))
                .orderQty(new BigDecimal("100"))
                .timeInForce(TimeInForce.DAY);
        var result = orderCreateCommandProcessor.process(new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        assertTrue(result.isSuccess(), result.getErrorMessage());
        return result.getOrderId();
    }

    private List<OutboxMessage> rowsOf(String orderId) {
        return outboxRepository.findAll().stream().filter(row -> orderId.equals(row.getAggregateId())).toList();
    }

    /** The order's messages on the orders topic, read from the start for up to {@code window}. */
    private List<OrderMessage> ordersMessages(String orderId, Duration window) {
        Properties fromStart = TestCommands.avroValues();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        List<OrderMessage> found = new ArrayList<>();
        try (Consumer<Object, Object> consumer =
                consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
            consumer.subscribe(List.of(ORDERS));
            long deadline = System.nanoTime() + window.toNanos();
            while (System.nanoTime() < deadline) {
                for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(200))) {
                    if (record.value() instanceof OrderMessage message && orderId.equals(message.getOrderId())) {
                        found.add(message);
                    }
                }
            }
        }
        return found;
    }
}
