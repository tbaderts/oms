package org.example.streaming.kafka;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.State;
import org.example.streaming.kafka.errors.DeadLetterMetrics;
import org.example.streaming.kafka.errors.DeadLetterTopicProvisioner;
import org.example.streaming.kafka.errors.DeadLetters;
import org.example.streaming.mapper.ExecutionMessageMapper;
import org.example.streaming.mapper.OrderMessageMapper;
import org.example.streaming.model.ExecutionEvent;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.StreamFilter;
import org.example.streaming.service.EventStreamProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.kafka.ConfluentKafkaContainer;
import org.testcontainers.utility.DockerImageName;

import io.confluent.kafka.serializers.KafkaAvroSerializer;
import io.micrometer.core.instrument.MeterRegistry;
import reactor.core.Disposable;

/**
 * SPEC-0077 AC-1 to AC-4 and AC-8 for the streaming service's two receivers: a record that fails is
 * retried for the (3 s) window, or dead-lettered at once when it cannot succeed, to
 * {@code <topic>.oms-streaming-service.DLT}; a record that cannot be decoded no longer stops the stream.
 */
@SpringBootTest(properties = {
    "streaming.kafka.enabled=true",
    "streaming.kafka.topics.orders=" + StreamErrorPolicyIntegrationTest.ORDERS,
    "streaming.kafka.topics.executions=" + StreamErrorPolicyIntegrationTest.EXECUTIONS,
    "spring.kafka.consumer.group-id=streaming-policy-it",
    "spring.kafka.properties.schema.registry.url=" + StreamErrorPolicyIntegrationTest.REGISTRY,
    "kafka.error-policy.retry-for=PT3S",
    "kafka.error-policy.initial-interval=PT0.1S",
    "kafka.error-policy.max-interval=PT0.5S",
    "spring.rsocket.server.port=0",
    "server.port=0"
})
class StreamErrorPolicyIntegrationTest {

    static final String ORDERS = "orders-policy";
    static final String EXECUTIONS = "executions-policy";
    static final String REGISTRY = "mock://streaming-policy-it";

    static final ConfluentKafkaContainer kafka = new ConfluentKafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.9.3"));

    static {
        kafka.start();
        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers()))) {
            admin.createTopics(List.of(new NewTopic(ORDERS, 2, (short) 1), new NewTopic(EXECUTIONS, 3, (short) 1)))
                    .all().get(30, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void kafkaProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
    }

    @Autowired EventStreamProvider provider;
    @Autowired MeterRegistry meterRegistry;
    @Autowired DeadLetterTopicProvisioner provisioner;
    @MockitoSpyBean OrderMessageMapper orderMessageMapper;
    @MockitoSpyBean ExecutionMessageMapper executionMessageMapper;

    private KafkaProducer<String, byte[]> raw;
    private KafkaAvroSerializer serializer;
    private final List<OrderEvent> orders = new CopyOnWriteArrayList<>();
    private final List<ExecutionEvent> fills = new CopyOnWriteArrayList<>();
    private Disposable orderSubscription;
    private Disposable fillSubscription;

    @BeforeEach
    void setUp() throws Exception {
        raw = new KafkaProducer<>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class));
        serializer = new KafkaAvroSerializer();
        serializer.configure(Map.of("schema.registry.url", REGISTRY, "auto.register.schemas", true), false);
        orderSubscription = provider.getOrderEventStream(StreamFilter.liveOnly()).subscribe(orders::add);
        fillSubscription = provider.getExecutionEventStream(StreamFilter.liveOnly()).subscribe(fills::add);

        // The fills receiver starts at the latest offset: wait until it is reading before testing.
        String probe = "PROBE-" + UUID.randomUUID();
        long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        while (fills.stream().noneMatch(e -> probe.equals(e.getOrderId()))) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("the fills receiver did not start");
            }
            sendFill(probe, probe + "-F1");
            Thread.sleep(500);
        }
    }

    @AfterEach
    void tearDown() {
        orderSubscription.dispose();
        fillSubscription.dispose();
        raw.close();
        serializer.close();
    }

    @Test
    void retryableFailureRetriedThenEmittedOnce() throws Exception {
        String orderId = "ORD-" + UUID.randomUUID();
        AtomicInteger calls = new AtomicInteger();
        AtomicReference<RecordMetadata> where = new AtomicReference<>();
        List<Long> committedWhileFailing = new CopyOnWriteArrayList<>();
        doAnswer(invocation -> {
            if (calls.incrementAndGet() <= 2) {
                if (where.get() != null) {
                    committedWhileFailing.add(committed(where.get()));
                }
                throw new IllegalStateException("mapper busy");
            }
            return invocation.callRealMethod();
        }).when(orderMessageMapper).toOrderEvent(argThat((OrderMessage m) -> m != null && orderId.equals(m.getOrderId())), any());

        RecordMetadata sent = sendOrder(orderId);
        where.set(sent);

        await(() -> orders.stream().anyMatch(e -> orderId.equals(e.getOrderId())), "the order emitted after two failures");
        assertThat(calls.get()).isEqualTo(3);
        assertThat(committedWhileFailing).as("the offset is not committed past the record while it fails")
                .allMatch(offset -> offset <= sent.offset());
        await(() -> committed(sent) > sent.offset(), "the offset committed after success");
        Thread.sleep(1_000);
        assertThat(orders.stream().filter(e -> orderId.equals(e.getOrderId()))).as("emitted once").hasSize(1);
        assertThat(deadLetters(ORDERS, orderId, Duration.ofSeconds(2))).isEmpty();
    }

    @Test
    void retryableFailurePastWindowDeadLettered() throws Exception {
        String orderId = "ORD-" + UUID.randomUUID();
        doAnswer(invocation -> {
            throw new IllegalStateException("mapper busy");
        }).when(executionMessageMapper).toExecutionDto(argThat((Execution f) -> f != null && (orderId + "-F1").equals(f.getExecId())));
        double before = counted(EXECUTIONS, "IllegalStateException");

        byte[] bytes = sendFill(orderId, orderId + "-F1");
        sendFill(orderId, orderId + "-F2"); // same key, same partition: behind the failing one

        List<ConsumerRecord<String, byte[]>> dead = deadLetters(EXECUTIONS, orderId, Duration.ofSeconds(20));
        assertThat(dead).hasSize(1);
        ConsumerRecord<String, byte[]> record = dead.getFirst();
        assertThat(record.value()).as("exactly the bytes it arrived with").isEqualTo(bytes);
        assertThat(header(record, "kafka_dlt-original-topic")).isEqualTo(EXECUTIONS);
        assertThat(record.headers().lastHeader("kafka_dlt-original-offset")).isNotNull();
        assertThat(header(record, "kafka_dlt-exception-message")).contains("mapper busy");
        assertThat(header(record, DeadLetters.HEADER_SOURCE)).isEqualTo("consumer");
        assertThat(header(record, DeadLetters.HEADER_SERVICE)).isEqualTo("oms-streaming-service");

        await(() -> fills.stream().anyMatch(e -> (orderId + "-F2").equals(e.getExecId())), "the next fill emitted");
        assertThat(counted(EXECUTIONS, "IllegalStateException") - before).isEqualTo(1.0);
    }

    @Test
    void nonRetryableFailureDeadLetteredAtOnce() throws Exception {
        String orderId = "ORD-" + UUID.randomUUID();
        AtomicInteger calls = new AtomicInteger();
        doAnswer(invocation -> {
            calls.incrementAndGet();
            throw new NullPointerException("msg.price");
        }).when(orderMessageMapper).toOrderEvent(argThat((OrderMessage m) -> m != null && orderId.equals(m.getOrderId())), any());
        String next = "ORD-" + UUID.randomUUID();
        long started = System.nanoTime();

        sendOrder(orderId);
        sendOrder(next);

        await(() -> orders.stream().anyMatch(e -> next.equals(e.getOrderId())), "the next order emitted");
        assertThat(Duration.ofNanos(System.nanoTime() - started)).as("no back-off spent").isLessThan(Duration.ofSeconds(3));
        assertThat(deadLetters(ORDERS, orderId, Duration.ofSeconds(5))).hasSize(1);
        assertThat(calls.get()).as("a null pointer is not retried").isEqualTo(1);
    }

    /** AC-1 on the executions receiver. */
    @Test
    void retryableFillFailureRetriedThenEmittedOnce() throws Exception {
        String orderId = "ORD-" + UUID.randomUUID();
        String execId = orderId + "-F1";
        AtomicInteger calls = new AtomicInteger();
        doAnswer(invocation -> {
            if (calls.incrementAndGet() <= 2) {
                throw new IllegalStateException("mapper busy");
            }
            return invocation.callRealMethod();
        }).when(executionMessageMapper).toExecutionDto(argThat((Execution f) -> f != null && execId.equals(f.getExecId())));

        sendFill(orderId, execId);

        await(() -> fills.stream().anyMatch(e -> execId.equals(e.getExecId())), "the fill emitted after two failures");
        assertThat(calls.get()).isEqualTo(3);
        Thread.sleep(1_000);
        assertThat(fills.stream().filter(e -> execId.equals(e.getExecId()))).as("emitted once").hasSize(1);
        assertThat(deadLetters(EXECUTIONS, orderId, Duration.ofSeconds(2))).isEmpty();
    }

    /** AC-3 on the executions receiver. */
    @Test
    void nonRetryableFillFailureDeadLetteredAtOnce() throws Exception {
        String orderId = "ORD-" + UUID.randomUUID();
        String execId = orderId + "-F1";
        AtomicInteger calls = new AtomicInteger();
        doAnswer(invocation -> {
            calls.incrementAndGet();
            throw new NullPointerException("fill.lastPx");
        }).when(executionMessageMapper).toExecutionDto(argThat((Execution f) -> f != null && execId.equals(f.getExecId())));
        long started = System.nanoTime();

        sendFill(orderId, execId);
        sendFill(orderId, orderId + "-F2");

        await(() -> fills.stream().anyMatch(e -> (orderId + "-F2").equals(e.getExecId())), "the next fill emitted");
        assertThat(Duration.ofNanos(System.nanoTime() - started)).as("no back-off spent").isLessThan(Duration.ofSeconds(3));
        assertThat(deadLetters(EXECUTIONS, orderId, Duration.ofSeconds(5))).hasSize(1);
        assertThat(calls.get()).as("a null pointer is not retried").isEqualTo(1);
    }

    @Test
    void poisonRecordDeadLetteredAndStreamContinues() throws Exception {
        String poison = "ORD-" + UUID.randomUUID();
        String next = "ORD-" + UUID.randomUUID();

        raw.send(new ProducerRecord<>(ORDERS, poison, "not avro at all".getBytes(StandardCharsets.UTF_8))).get(10, TimeUnit.SECONDS);
        sendOrder(next);

        await(() -> orders.stream().anyMatch(e -> next.equals(e.getOrderId())), "a later order still reaches the subscriber");
        List<ConsumerRecord<String, byte[]>> dead = deadLetters(ORDERS, poison, Duration.ofSeconds(10));
        assertThat(dead).hasSize(1);
        assertThat(new String(dead.getFirst().value(), StandardCharsets.UTF_8)).isEqualTo("not avro at all");
    }

    @Test
    void provisionedWithSourcePartitions() {
        assertThat(provisioner.topics())
                .containsEntry(ORDERS + ".oms-streaming-service.DLT", 2)
                .containsEntry(EXECUTIONS + ".oms-streaming-service.DLT", 3);
    }

    // --- helpers -------------------------------------------------------------------------------

    private RecordMetadata sendOrder(String orderId) throws Exception {
        OrderMessage message = new OrderMessage();
        message.setOrderId(orderId);
        message.setRootOrderId(orderId);
        message.setSymbol("AAPL");
        message.setState(State.LIVE);
        message.setEventId(1L);
        return raw.send(new ProducerRecord<>(ORDERS, orderId, serializer.serialize(ORDERS, message))).get(10, TimeUnit.SECONDS);
    }

    /** The receivers' committed offset on the record's partition (the next to read), -1 when none. */
    private static long committed(RecordMetadata record) {
        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers()))) {
            var offset = admin.listConsumerGroupOffsets("streaming-policy-it").partitionsToOffsetAndMetadata()
                    .get(10, TimeUnit.SECONDS).get(new TopicPartition(record.topic(), record.partition()));
            return offset == null ? -1 : offset.offset();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private byte[] sendFill(String orderId, String execId) throws Exception {
        Execution fill = Execution.newBuilder().setExecId(execId).setOrderId(orderId).setSymbol("AAPL")
                .setLastQty(BigDecimal.TEN.setScale(8)).setExecType("F").setOrderVersion(1L).build();
        byte[] bytes = serializer.serialize(EXECUTIONS, fill);
        raw.send(new ProducerRecord<>(EXECUTIONS, orderId, bytes)).get(10, TimeUnit.SECONDS);
        return bytes;
    }

    private double counted(String topic, String exception) {
        var counter = meterRegistry.find(DeadLetterMetrics.DEAD_LETTERS)
                .tags("service", "oms-streaming-service", "topic", topic, "side", "consumer", "exception", exception).counter();
        return counter == null ? 0 : counter.count();
    }

    private static String header(ConsumerRecord<?, ?> record, String key) {
        return new String(record.headers().lastHeader(key).value(), StandardCharsets.UTF_8);
    }

    private static void await(java.util.function.BooleanSupplier condition, String what) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
        while (!condition.getAsBoolean()) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("Timed out waiting for: " + what);
            }
            Thread.sleep(100);
        }
    }

    private static List<ConsumerRecord<String, byte[]>> deadLetters(String source, String key, Duration wait) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "it-dlt-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        List<ConsumerRecord<String, byte[]>> found = new ArrayList<>();
        try (KafkaConsumer<String, byte[]> consumer = new KafkaConsumer<>(config)) {
            consumer.subscribe(List.of(source + ".oms-streaming-service.DLT"));
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
}
