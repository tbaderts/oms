package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.UUID;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.Order;
import org.example.common.model.msg.OrderMessage;
import org.example.oms.model.Event;
import org.example.oms.service.OrderEventAppender;
import org.example.oms.service.leadership.Leadership;
import org.example.oms.service.leadership.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * SPEC-0048 AC-4: a commit is published as soon as it commits, not at the relay's next poll, and a
 * backlog larger than one batch drains in one go.
 *
 * <p>The poll is set to 10 seconds, so anything published sooner was nudged. The class runs in a
 * database, command topic and consumer group of its own, so this context is the relay leader of its
 * world whatever other test contexts are cached.
 */
@TestPropertySource(properties = {"kafka.outbox.poll-interval-ms=10000", "kafka.outbox.batch-size=5"})
class OutboxNudgeIntegrationTest extends AbstractFillFlowIntegrationTest {

    /** This class's own database, command topic and consumer group. */
    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        isolate("nudge", "commands-nudge");
        registry.add("spring.kafka.consumer.group-id", () -> "oms-nudge");
    }

    @Autowired Leadership leadership;
    @Autowired OrderEventAppender orderEventAppender;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired ConsumerFactory<Object, Object> consumerFactory;

    @org.springframework.beans.factory.annotation.Value("${spring.datasource.url}") String datasourceUrl;
    @org.springframework.beans.factory.annotation.Value("${kafka.command-topic}") String configuredCommandTopic;

    /** The class must run in its own database and command topic, or it would lead the shared ones. */
    @Test
    void runsInItsOwnDatabaseAndTopic() {
        org.junit.jupiter.api.Assertions.assertTrue(datasourceUrl.contains("/oms_nudge"), datasourceUrl);
        assertEquals("commands-nudge", configuredCommandTopic);
    }

    @Test
    void commitIsPublishedWithoutWaitingForThePoll() throws Exception {
        assertTrue(leadership.holds(Role.OUTBOX_RELAY), "this context leads the relay of its own database");
        String orderId = createLiveOrder();

        try (Consumer<Object, Object> orders = subscribedToOrders()) {
            long start = System.nanoTime();
            assertEquals(201, postFill(orderId + "-N", orderId, "10", null));
            long version = orderRepository.findByOrderId(orderId).orElseThrow().getTxNr();

            List<Long> seen = eventIds(orders, orderId, java.util.Set.of(version), Duration.ofSeconds(5));
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;

            assertTrue(seen.contains(version), "the fill's order record arrived: " + seen);
            assertTrue(elapsedMs < 1_000, "published within 1 s of the commit, not at the 10 s poll: " + elapsedMs + " ms");
        }
    }

    @Test
    void backlogLargerThanABatchDrainsInOneGo() throws Exception {
        assertTrue(leadership.holds(Role.OUTBOX_RELAY));
        String orderId = createLiveOrder();

        try (Consumer<Object, Object> orders = subscribedToOrders()) {
            long before = orderRepository.findByOrderId(orderId).orElseThrow().getTxNr();
            // Twelve rows in one commit, so one nudge; the batch size is 5.
            transactionTemplate.executeWithoutResult(status -> {
                Order order = orderRepository.findByOrderId(orderId).orElseThrow();
                for (int i = 0; i < 12; i++) {
                    orderEventAppender.appendOrderEvent(order, Event.ACK, null);
                }
            });

            List<Long> expected = new ArrayList<>();
            for (long v = before + 1; v <= before + 12; v++) {
                expected.add(v);
            }
            List<Long> seen = eventIds(orders, orderId, java.util.Set.copyOf(expected), Duration.ofSeconds(5));
            assertEquals(expected, seen.stream().filter(v -> v > before).toList(),
                    "all twelve, in order, within 5 s: three batches without waiting for the 10 s poll");
        }
    }

    private Consumer<Object, Object> subscribedToOrders() {
        Properties properties = TestCommands.avroValues();
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        Consumer<Object, Object> consumer = consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, properties);
        consumer.subscribe(List.of("orders"));
        // Joined before the command is sent, so the measured time is publication, not consumer start.
        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (consumer.assignment().isEmpty() && System.nanoTime() < deadline) {
            consumer.poll(Duration.ofMillis(100));
        }
        return consumer;
    }

    /** The eventIds of the order's records on oms_orders, in arrival order, as soon as the awaited ones arrived. */
    private static List<Long> eventIds(Consumer<Object, Object> consumer, String orderId, java.util.Set<Long> awaited, Duration within) {
        List<Long> ids = new ArrayList<>();
        long deadline = System.nanoTime() + within.toNanos();
        while (System.nanoTime() < deadline) {
            for (ConsumerRecord<Object, Object> record : consumer.poll(Duration.ofMillis(50))) {
                if (orderId.equals(record.key()) && record.value() instanceof OrderMessage message) {
                    ids.add(message.getEventId());
                }
            }
            if (ids.containsAll(awaited)) {
                break;
            }
        }
        return ids;
    }
}
