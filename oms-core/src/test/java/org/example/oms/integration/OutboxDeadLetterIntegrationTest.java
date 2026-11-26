package org.example.oms.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.errors.NetworkException;
import org.apache.kafka.common.errors.SerializationException;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.TimeInForce;
import org.example.oms.kafka.errors.DeadLetterMetrics;
import org.example.oms.kafka.errors.DeadLetters;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.service.MessagePublisher;
import org.example.oms.service.OutboxDeadLetterPublisher;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0077 AC-6 and AC-7 for the outbox: an unreachable broker never dead-letters, a retryable failure
 * that clears is delivered once, and a message that cannot be sent (at once, or once the 3 s test
 * window has passed) is dead-lettered to {@code <topic>.oms-core.DLT}, parked, and holds the later
 * messages of its order while other orders are published.
 */
class OutboxDeadLetterIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final String ORDERS = "orders";
    private static final String DLT = ORDERS + ".oms-core.DLT";

    @MockitoSpyBean MessagePublisher messagePublisher;
    @MockitoSpyBean OutboxDeadLetterPublisher deadLetterPublisher;
    @Autowired OutboxRepository outboxRepository;
    @Autowired OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;
    @Autowired ConsumerFactory<Object, Object> consumerFactory;
    @Autowired MeterRegistry meterRegistry;
    @Value("${kafka.error-policy.retry-for}") Duration retryFor;

    private final List<String> parkedOrders = new ArrayList<>();

    @AfterEach
    void releaseParkedAggregates() {
        // A parked row holds its order; remove it and everything behind it, in one go.
        outboxRepository.deleteAllByIdInBatch(outboxRepository.findAll().stream()
                .filter(row -> parkedOrders.contains(row.getAggregateId()))
                .map(OutboxMessage::getId)
                .toList());
    }

    @Test
    void transientOutageNeverDeadLettered() throws Exception {
        String orderId = createUnackOrder();
        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the new order published");
        long until = System.nanoTime() + retryFor.plusSeconds(1).toNanos();
        failAcceptOf(orderId, () -> System.nanoTime() < until ? new NetworkException("broker unreachable") : null);

        accept(orderId);

        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the accept published once the broker came back, past the window");
        assertThat(ordersMessages(orderId, Duration.ofSeconds(3)).stream().filter(m -> m.getEventId() == 2L)).hasSize(1);
        assertThat(deadLetters(orderId, Duration.ofSeconds(2))).isEmpty();
    }

    @Test
    void retryableFailureThenSuccessDeliveredOnce() throws Exception {
        String orderId = createUnackOrder();
        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the new order published");
        AtomicInteger failures = new AtomicInteger();
        failAcceptOf(orderId, () -> failures.incrementAndGet() <= 2 ? new IllegalStateException("registry lookup failed") : null);

        accept(orderId);

        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the accept published after two retryable failures");
        assertThat(failures.get()).isEqualTo(3);
        assertThat(ordersMessages(orderId, Duration.ofSeconds(3)).stream().filter(m -> m.getEventId() == 2L)).hasSize(1);
        assertThat(deadLetters(orderId, Duration.ofSeconds(2))).isEmpty();
    }

    @Test
    void nonRetryableSendDeadLetteredAndAggregateHeld() throws Exception {
        String orderId = createUnackOrder();
        parkedOrders.add(orderId);
        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the new order published");
        failAcceptOf(orderId, () -> new SerializationException("Error serializing Avro message: unknown field"));
        double before = counted("SerializationException");
        long started = System.nanoTime();

        accept(orderId);
        awaitUntil(() -> rowsOf(orderId).stream().anyMatch(OutboxMessage::isParked), "the accept dead-lettered");
        Duration took = Duration.ofNanos(System.nanoTime() - started);

        OutboxMessage parked = rowsOf(orderId).stream().filter(OutboxMessage::isParked).findFirst().orElseThrow();
        assertThat(parked.getDeadLetterTopic()).isEqualTo(DLT);
        assertThat(parked.getAttempts()).as("not retried").isEqualTo(1);
        assertThat(took).as("at once, not after the window").isLessThan(retryFor);

        List<ConsumerRecord<String, byte[]>> dead = deadLetters(orderId, Duration.ofSeconds(10));
        assertThat(dead).hasSize(1);
        assertThat(dead.getFirst().value()[0]).as("the Avro record, magic byte first").isZero();
        assertThat(header(dead.getFirst(), KafkaHeaders.DLT_EXCEPTION_FQCN)).isEqualTo(SerializationException.class.getName());
        assertThat(header(dead.getFirst(), KafkaHeaders.DLT_ORIGINAL_TOPIC)).isEqualTo(ORDERS);
        assertThat(header(dead.getFirst(), DeadLetters.HEADER_SOURCE)).isEqualTo("producer");
        assertThat(counted("SerializationException") - before).isEqualTo(1.0);

        // A later message of the same order (a fill) stays held; another order goes through.
        assertThat(postFill(orderId + "-E1", orderId, "10", null)).isEqualTo(201);
        String other = createUnackOrder();
        awaitUntil(() -> rowsOf(other).isEmpty(), "the other order published");
        Thread.sleep(1_000);
        assertThat(rowsOf(orderId).stream().filter(row -> !row.isParked() && ORDERS.equals(row.getTopic())))
                .as("held behind the parked row").isNotEmpty()
                .allMatch(row -> row.getAttempts() == 0);
        assertThat(ordersMessages(orderId, Duration.ofSeconds(2))).noneMatch(m -> m.getEventId() >= 2L);
    }

    @Test
    void retryableFailurePastWindowDeadLettered() throws Exception {
        String orderId = createUnackOrder();
        parkedOrders.add(orderId);
        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the new order published");
        failAcceptOf(orderId, () -> new IllegalStateException("registry lookup failed"));
        long started = System.nanoTime();

        accept(orderId);
        awaitUntil(() -> rowsOf(orderId).stream().anyMatch(OutboxMessage::isParked), "dead-lettered once the window passed");
        Duration took = Duration.ofNanos(System.nanoTime() - started);

        OutboxMessage parked = rowsOf(orderId).stream().filter(OutboxMessage::isParked).findFirst().orElseThrow();
        assertThat(took).isGreaterThanOrEqualTo(retryFor);
        assertThat(parked.getAttempts()).as("retried with back-off").isGreaterThan(2);
        assertThat(parked.getDeadLetterTopic()).isEqualTo(DLT);
        assertThat(deadLetters(orderId, Duration.ofSeconds(10))).hasSize(1);
    }

    @Test
    void deadLetterRefusedLeavesRowStuck() throws Exception {
        String orderId = createUnackOrder();
        parkedOrders.add(orderId);
        awaitUntil(() -> rowsOf(orderId).isEmpty(), "the new order published");
        failAcceptOf(orderId, () -> new SerializationException("bad"));
        doReturn(new OutboxDeadLetterPublisher.Outcome.Refused(new org.apache.kafka.common.errors.TopicAuthorizationException("no write")))
                .when(deadLetterPublisher).deadLetter(argThat(row -> row != null && orderId.equals(row.getAggregateId())), any(), any());

        accept(orderId);
        awaitUntil(() -> rowsOf(orderId).stream().anyMatch(OutboxMessage::isParked), "parked though the DLT refused it");

        OutboxMessage parked = rowsOf(orderId).stream().filter(OutboxMessage::isParked).findFirst().orElseThrow();
        assertThat(parked.getDeadLetterTopic()).isNull();
        assertThat(parked.getLastError()).contains("refused");
        assertThat(meterRegistry.get("oms.outbox.stuck").gauge().value()).isGreaterThanOrEqualTo(1.0);
    }

    // --- helpers -------------------------------------------------------------------------------

    /** Makes the accept (event 2) of {@code orderId} fail with what {@code failure} returns, or send when it returns null. */
    private void failAcceptOf(String orderId, java.util.function.Supplier<RuntimeException> failure) {
        doAnswer(invocation -> {
            RuntimeException f = failure.get();
            return f == null ? invocation.callRealMethod() : CompletableFuture.failedFuture(f);
        }).when(messagePublisher).publishAsync(
                argThat(row -> row != null && orderId.equals(row.getAggregateId()) && row.getAggregateVersion() >= 2 && ORDERS.equals(row.getTopic())),
                any());
    }

    private void accept(String orderId) {
        var accepted = orderLifecycleCommandProcessor.process(new OrderAcceptCmd().orderId(orderId).type("OrderAcceptCmd"), Instant.now());
        org.junit.jupiter.api.Assertions.assertTrue(accepted.isSuccess(), accepted.getErrorMessage());
    }

    private String createUnackOrder() {
        var order = new org.example.common.model.cmd.Order()
                .clOrdId("CL-" + UUID.randomUUID())
                .sessionId("SES-DLT")
                .account("ACC-DLT")
                .symbol("AAPL")
                .side(org.example.common.model.cmd.Side.BUY)
                .ordType(org.example.common.model.cmd.OrdType.LIMIT)
                .price(new BigDecimal("170"))
                .orderQty(new BigDecimal("100"))
                .timeInForce(org.example.common.model.cmd.TimeInForce.DAY);
        var result = orderCreateCommandProcessor.process(new OrderCreateCmd().type("OrderCreateCmd").order(order), Instant.now());
        org.junit.jupiter.api.Assertions.assertTrue(result.isSuccess(), result.getErrorMessage());
        return result.getOrderId();
    }

    private List<OutboxMessage> rowsOf(String orderId) {
        return outboxRepository.findAll().stream().filter(row -> orderId.equals(row.getAggregateId())).toList();
    }

    private double counted(String exception) {
        var counter = meterRegistry.find(DeadLetterMetrics.DEAD_LETTERS)
                .tags("service", "oms-core", "topic", ORDERS, "side", "producer", "exception", exception).counter();
        return counter == null ? 0 : counter.count();
    }

    private static String header(ConsumerRecord<?, ?> record, String key) {
        return new String(record.headers().lastHeader(key).value(), StandardCharsets.UTF_8);
    }

    private List<ConsumerRecord<String, byte[]>> deadLetters(String key, Duration wait) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "it-dlt-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        List<ConsumerRecord<String, byte[]>> found = new ArrayList<>();
        try (KafkaConsumer<String, byte[]> consumer = new KafkaConsumer<>(config)) {
            consumer.subscribe(List.of(DLT));
            long deadline = System.nanoTime() + wait.toNanos();
            while (System.nanoTime() < deadline && found.isEmpty()) {
                for (var record : consumer.poll(Duration.ofMillis(250))) {
                    if (key.equals(record.key())) {
                        found.add(record);
                    }
                }
            }
            for (var record : consumer.poll(Duration.ofMillis(500))) {
                if (key.equals(record.key())) {
                    found.add(record);
                }
            }
        }
        return found;
    }

    /** The order's messages on the orders topic, read from the start for up to {@code window}. */
    private List<OrderMessage> ordersMessages(String orderId, Duration window) {
        Properties fromStart = TestCommands.avroValues();
        fromStart.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        List<OrderMessage> found = new ArrayList<>();
        try (Consumer<Object, Object> consumer = consumerFactory.createConsumer("it-" + UUID.randomUUID(), null, null, fromStart)) {
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
