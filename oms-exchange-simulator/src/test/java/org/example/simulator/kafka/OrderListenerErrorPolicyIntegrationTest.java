package org.example.simulator.kafka;

import static org.assertj.core.api.Assertions.assertThat;
import static org.example.simulator.engine.TestOrders.market;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.Consumer;
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
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.simulator.AbstractKafkaIntegrationTest;
import org.example.simulator.engine.ExchangeEngine;
import org.example.simulator.kafka.errors.DeadLetterMetrics;
import org.example.simulator.kafka.errors.DeadLetterTopicProvisioner;
import org.example.simulator.kafka.errors.DeadLetters;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import io.confluent.kafka.serializers.KafkaAvroDeserializer;
import io.confluent.kafka.serializers.KafkaAvroSerializer;
import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0077 AC-1, AC-2, AC-3 and AC-8 for the simulator's order consumer: retryable failures are
 * retried within the (3 s) window, the rest go to {@code <topic>.oms-exchange-simulator.DLT} with the
 * bytes they arrived with, and the next order is still handled.
 */
@SpringBootTest(
        properties = {
            "simulator.order-topic=" + OrderListenerErrorPolicyIntegrationTest.ORDERS,
            "simulator.command-topic=" + OrderListenerErrorPolicyIntegrationTest.COMMANDS,
            "simulator.fill-slices=1",
            "simulator.fill-delay=0ms",
            "simulator.reference-prices.AAPL=170.00",
            "spring.kafka.consumer.group-id=exchange-simulator-policy-it",
            "spring.kafka.consumer.auto-offset-reset=earliest",
            "kafka.error-policy.retry-for=PT3S",
            "kafka.error-policy.initial-interval=PT0.1S",
            "kafka.error-policy.max-interval=PT0.5S"
        })
class OrderListenerErrorPolicyIntegrationTest extends AbstractKafkaIntegrationTest {

    static final String ORDERS = "orders-policy";
    static final String COMMANDS = "commands-policy";
    static final String DLT = ORDERS + ".oms-exchange-simulator.DLT";

    static {
        // The source topics exist before the application starts, as in a real deployment.
        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers()))) {
            admin.createTopics(List.of(new NewTopic(ORDERS, 3, (short) 1), new NewTopic(COMMANDS, 2, (short) 1)))
                    .all().get(30, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @MockitoSpyBean ExchangeEngine engine;
    @Autowired MeterRegistry meterRegistry;
    @Autowired DeadLetterTopicProvisioner provisioner;

    private KafkaProducer<String, byte[]> raw;
    private KafkaAvroSerializer serializer;
    private Consumer<String, Object> commands;
    private final Map<String, List<Object>> seen = new HashMap<>();

    @BeforeEach
    void setUp() {
        raw = new KafkaProducer<>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class));
        serializer = new KafkaAvroSerializer();
        serializer.configure(Map.of("schema.registry.url", REGISTRY), false);

        Map<String, Object> consumer = new HashMap<>();
        consumer.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
        consumer.put(ConsumerConfig.GROUP_ID_CONFIG, "it-" + UUID.randomUUID());
        consumer.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        consumer.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        consumer.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, KafkaAvroDeserializer.class);
        consumer.put("schema.registry.url", REGISTRY);
        consumer.put("specific.avro.reader", true);
        commands = new DefaultKafkaConsumerFactory<String, Object>(consumer).createConsumer();
        commands.subscribe(List.of(COMMANDS));
    }

    @AfterEach
    void tearDown() {
        commands.close();
        raw.close();
        serializer.close();
    }

    @Test
    void retryableFailureRetriedThenProcessedOnce() throws Exception {
        String orderId = "ORD-" + UUID.randomUUID();
        AtomicInteger calls = new AtomicInteger();
        java.util.concurrent.atomic.AtomicReference<RecordMetadata> where = new java.util.concurrent.atomic.AtomicReference<>();
        List<Long> committedWhileFailing = new java.util.concurrent.CopyOnWriteArrayList<>();
        doAnswer(invocation -> {
            if (calls.incrementAndGet() <= 2) {
                if (where.get() != null) {
                    committedWhileFailing.add(committed(where.get()));
                }
                throw new IllegalStateException("engine busy");
            }
            return invocation.callRealMethod();
        }).when(engine).onOrderMessage(argThat((OrderMessage m) -> m != null && orderId.equals(m.getOrderId())));

        RecordMetadata record = raw.send(new ProducerRecord<>(ORDERS, orderId,
                serializer.serialize(ORDERS, market(orderId, Side.BUY, "100")))).get(10, TimeUnit.SECONDS);
        where.set(record);

        List<Object> sent = awaitCommands(orderId, 2, Duration.ofSeconds(15));
        assertThat(sent.getFirst()).isInstanceOf(OrderAcceptCmd.class);
        assertThat(calls.get()).isEqualTo(3);
        assertThat(committedWhileFailing).as("the offset is not committed past the record while it fails")
                .allMatch(offset -> offset <= record.offset());
        long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
        while (committed(record) <= record.offset()) {
            assertThat(System.nanoTime()).as("the offset committed after success").isLessThan(deadline);
            Thread.sleep(100);
        }
        assertThat(awaitCommands(orderId, 3, Duration.ofSeconds(1))).as("answered once").hasSize(2);
        assertThat(deadLetters(orderId, Duration.ofSeconds(2))).isEmpty();
    }

    @Test
    void retryableFailurePastWindowDeadLettered() throws Exception {
        String stuck = "ORD-" + UUID.randomUUID();
        String next = "ORD-" + UUID.randomUUID();
        doAnswer(invocation -> {
            throw new IllegalStateException("engine busy");
        }).when(engine).onOrderMessage(argThat((OrderMessage m) -> m != null && stuck.equals(m.getOrderId())));
        double before = counted("IllegalStateException");

        byte[] bytes = publish(market(stuck, Side.BUY, "100"));
        publishKeyed(stuck, market(next, Side.BUY, "100")); // same key, same partition: behind the stuck one

        List<ConsumerRecord<String, byte[]>> dead = deadLetters(stuck, Duration.ofSeconds(20));
        assertThat(dead).hasSize(1);
        ConsumerRecord<String, byte[]> record = dead.getFirst();
        assertThat(record.value()).as("exactly the bytes it arrived with").isEqualTo(bytes);
        assertThat(header(record, KafkaHeaders.DLT_ORIGINAL_TOPIC)).isEqualTo(ORDERS);
        assertThat(record.headers().lastHeader(KafkaHeaders.DLT_ORIGINAL_OFFSET)).isNotNull();
        assertThat(header(record, KafkaHeaders.DLT_EXCEPTION_MESSAGE)).contains("engine busy");
        assertThat(header(record, DeadLetters.HEADER_SOURCE)).isEqualTo("consumer");
        assertThat(header(record, DeadLetters.HEADER_SERVICE)).isEqualTo("oms-exchange-simulator");

        assertThat(awaitCommands(next, 1, Duration.ofSeconds(10))).as("the next order is handled").isNotEmpty();
        assertThat(counted("IllegalStateException") - before).isEqualTo(1.0);
    }

    @Test
    void nonRetryableFailureDeadLetteredAtOnce() throws Exception {
        String npe = "ORD-" + UUID.randomUUID();
        String garbage = "ORD-" + UUID.randomUUID();
        String next = "ORD-" + UUID.randomUUID();
        AtomicInteger calls = new AtomicInteger();
        doAnswer(invocation -> {
            calls.incrementAndGet();
            throw new NullPointerException("order.price");
        }).when(engine).onOrderMessage(argThat((OrderMessage m) -> m != null && npe.equals(m.getOrderId())));
        long started = System.nanoTime();

        publish(market(npe, Side.BUY, "100"));
        raw.send(new ProducerRecord<>(ORDERS, garbage, new byte[] {1, 2, 3})).get(10, TimeUnit.SECONDS);
        publish(market(next, Side.BUY, "100"));

        assertThat(awaitCommands(next, 1, Duration.ofSeconds(15))).as("orders behind them are handled").isNotEmpty();
        Duration took = Duration.ofNanos(System.nanoTime() - started);
        assertThat(deadLetters(npe, Duration.ofSeconds(5))).hasSize(1);
        List<ConsumerRecord<String, byte[]>> undecodable = deadLetters(garbage, Duration.ofSeconds(5));
        assertThat(undecodable).hasSize(1);
        assertThat(undecodable.getFirst().value()).containsExactly(1, 2, 3);
        assertThat(calls.get()).as("a null pointer is not retried").isEqualTo(1);
        assertThat(took).as("no back-off spent on them").isLessThan(Duration.ofSeconds(3));
    }

    @Test
    void provisionedWithSourcePartitions() {
        assertThat(provisioner.topics())
                .containsEntry(DLT, 3)
                .containsEntry(COMMANDS + ".oms-exchange-simulator.DLT", 2);
    }

    /** SPEC-0077 AC-9: the order listener runs with the policy's error handler. */
    @Test
    void listenerFactoryUsesThePolicy(
            @Autowired org.springframework.kafka.config.KafkaListenerEndpointRegistry listeners,
            @Autowired org.springframework.kafka.listener.DefaultErrorHandler orderErrorHandler) {
        var containers = listeners.getListenerContainers();
        assertThat(containers).isNotEmpty();
        for (var container : containers) {
            for (var child : ((org.springframework.kafka.listener.ConcurrentMessageListenerContainer<?, ?>) container).getContainers()) {
                assertThat(child.getCommonErrorHandler()).isSameAs(orderErrorHandler);
            }
        }
    }

    // --- helpers -------------------------------------------------------------------------------

    /** The listener group's committed offset on the record's partition (the next to read), -1 when none. */
    private static long committed(RecordMetadata record) {
        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers()))) {
            var offset = admin.listConsumerGroupOffsets("exchange-simulator-policy-it").partitionsToOffsetAndMetadata()
                    .get(10, TimeUnit.SECONDS).get(new TopicPartition(record.topic(), record.partition()));
            return offset == null ? -1 : offset.offset();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private byte[] publish(OrderMessage message) throws Exception {
        return publishKeyed(message.getOrderId(), message);
    }

    private byte[] publishKeyed(String key, OrderMessage message) throws Exception {
        byte[] bytes = serializer.serialize(ORDERS, message);
        raw.send(new ProducerRecord<>(ORDERS, key, bytes)).get(10, TimeUnit.SECONDS);
        return bytes;
    }

    private double counted(String exception) {
        var counter = meterRegistry.find(DeadLetterMetrics.DEAD_LETTERS)
                .tags("service", "oms-exchange-simulator", "topic", ORDERS, "side", "consumer", "exception", exception).counter();
        return counter == null ? 0 : counter.count();
    }

    private static String header(ConsumerRecord<?, ?> record, String key) {
        return new String(record.headers().lastHeader(key).value(), StandardCharsets.UTF_8);
    }

    private List<Object> awaitCommands(String orderId, int expected, Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        List<Object> found = new ArrayList<>(seen.getOrDefault(orderId, List.of()));
        while (found.size() < expected && System.nanoTime() < deadline) {
            for (ConsumerRecord<String, Object> record : commands.poll(Duration.ofMillis(200))) {
                seen.computeIfAbsent(record.key(), k -> new ArrayList<>()).add(record.value());
                if (orderId.equals(record.key())) {
                    found.add(record.value());
                }
            }
        }
        return found;
    }

    private static List<ConsumerRecord<String, byte[]>> deadLetters(String key, Duration wait) {
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
}
