package org.example.oms.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.oms.config.KafkaTopicProvisioner;
import org.example.oms.kafka.errors.DeadLetterMetrics;
import org.example.oms.kafka.errors.DeadLetters;
import org.example.oms.service.command.CommandDispatcher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.PermissionDeniedDataAccessException;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.ConcurrentMessageListenerContainer;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.kafka.test.utils.ContainerTestUtils;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0077 AC-1, AC-2, AC-3 and AC-5 for oms-core's command consumer: retryable failures are retried
 * within the window, failures that cannot succeed are dead-lettered at once to
 * {@code <topic>.oms-core.DLT}, and concurrency conflicts are never dead-lettered.
 *
 * <p>Runs in a world of its own (retry window 3 s), so its spied dispatcher is the only consumer of its
 * command topic.
 */
class CommandErrorPolicyIntegrationTest extends AbstractFillFlowIntegrationTest {

    private static final String TOPIC = "commands-policy";
    private static final String DLT = TOPIC + ".oms-core.DLT";

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        isolate("policy", TOPIC);
        registry.add("spring.kafka.consumer.group-id", () -> "oms-policy");
    }

    @MockitoSpyBean CommandDispatcher commandDispatcher;
    @Autowired MeterRegistry meterRegistry;
    @Autowired KafkaListenerEndpointRegistry listeners;
    @Autowired KafkaTopicProvisioner provisioner;
    @Value("${kafka.error-policy.retry-for}") Duration retryFor;

    @BeforeEach
    void everyConsumerOwnsOnePartition() throws Exception {
        // A rebalance while consumers are still joining would hand a record to another consumer, which
        // restarts its back-off; wait until each consumer owns exactly one partition.
        MessageListenerContainer container = listeners.getListenerContainers().stream()
                .filter(c -> List.of(c.getContainerProperties().getTopics()).contains(TOPIC))
                .findFirst()
                .orElseThrow();
        ContainerTestUtils.waitForAssignment(container, provisioner.commandPartitions());
        var consumers = ((ConcurrentMessageListenerContainer<?, ?>) container).getContainers();
        // Six consumers joining one group on a fresh topic can take longer than the usual timeout.
        long deadline = System.nanoTime() + Duration.ofSeconds(60).toNanos();
        while (!(consumers.size() == provisioner.commandPartitions()
                && consumers.stream().allMatch(c -> c.getAssignedPartitions() != null && c.getAssignedPartitions().size() == 1))) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("The listener's consumers did not settle on one partition each");
            }
            Thread.sleep(100);
        }
    }

    @Test
    void retryableFailureRetriedThenProcessedOnce() throws Exception {
        String orderId = createLiveOrder();
        AtomicInteger calls = new AtomicInteger();
        java.util.concurrent.atomic.AtomicReference<TopicPartition> where = new java.util.concurrent.atomic.AtomicReference<>();
        List<Long> committedWhileFailing = new java.util.concurrent.CopyOnWriteArrayList<>();
        doAnswer(invocation -> {
            if (calls.incrementAndGet() <= 2) {
                if (where.get() != null) {
                    committedWhileFailing.add(committed(where.get()));
                }
                throw new IllegalStateException("database unavailable");
            }
            return invocation.callRealMethod();
        }).when(commandDispatcher).dispatch(argThat(fillOf(orderId, orderId + "-E1")), any());

        var sent = send(orderId, fill(orderId + "-E1", orderId, "10"));
        where.set(new TopicPartition(sent.topic(), sent.partition()));

        awaitUntil(() -> executionCount(orderId) == 1, "the fill applied after two retryable failures");
        assertThat(calls.get()).isEqualTo(3);
        assertThat(committedWhileFailing).as("the offset is not committed past the record while it fails")
                .allMatch(offset -> offset <= sent.offset());
        awaitUntil(() -> committed(where.get()) > sent.offset(), "the offset committed after success");
        Thread.sleep(1_000);
        assertThat(executionCount(orderId)).as("applied once").isEqualTo(1);
        assertThat(deadLetters(orderId, Duration.ofSeconds(2))).as("nothing dead-lettered").isEmpty();
    }

    @Test
    void retryableFailurePastWindowDeadLettered() throws Exception {
        String orderId = createLiveOrder();
        doThrow(new IllegalStateException("database unavailable"))
                .when(commandDispatcher).dispatch(argThat(fillOf(orderId, orderId + "-E1")), any());
        double before = deadLettered("IllegalStateException");

        send(orderId, fill(orderId + "-E1", orderId, "10"));
        send(orderId, fill(orderId + "-E2", orderId, "20"));

        List<ConsumerRecord<String, byte[]>> dead = deadLetters(orderId, TIMEOUT.plus(retryFor));
        assertThat(dead).hasSize(1);
        ConsumerRecord<String, byte[]> record = dead.getFirst();
        assertThat(record.value()[0]).as("the original Avro bytes, magic byte first").isZero();
        assertThat(header(record, KafkaHeaders.DLT_ORIGINAL_TOPIC)).isEqualTo(TOPIC);
        assertThat(record.headers().lastHeader(KafkaHeaders.DLT_ORIGINAL_PARTITION)).isNotNull();
        assertThat(record.headers().lastHeader(KafkaHeaders.DLT_ORIGINAL_OFFSET)).isNotNull();
        assertThat(header(record, KafkaHeaders.DLT_EXCEPTION_MESSAGE)).contains("database unavailable");
        assertThat(header(record, DeadLetters.HEADER_SOURCE)).isEqualTo("consumer");
        assertThat(header(record, DeadLetters.HEADER_SERVICE)).isEqualTo("oms-core");

        awaitUntil(() -> executionCount(orderId) == 1, "the next fill on the partition applied");
        assertThat(deadLettered("IllegalStateException") - before).isEqualTo(1.0);
    }

    @Test
    void nonRetryableFailureDeadLetteredAtOnce() throws Exception {
        String orderId = createLiveOrder();
        AtomicInteger npe = new AtomicInteger();
        AtomicInteger denied = new AtomicInteger();
        doAnswer(invocation -> {
            npe.incrementAndGet();
            throw new NullPointerException("execution.lastPx");
        }).when(commandDispatcher).dispatch(argThat(fillOf(orderId, orderId + "-NPE")), any());
        doAnswer(invocation -> {
            denied.incrementAndGet();
            throw new PermissionDeniedDataAccessException("insert into executions",
                    new SQLException("permission denied for table executions", "42501"));
        }).when(commandDispatcher).dispatch(argThat(fillOf(orderId, orderId + "-DENIED")), any());
        long sent = System.nanoTime();

        send(orderId, fill(orderId + "-NPE", orderId, "10"));
        send(orderId, fill(orderId + "-DENIED", orderId, "10"));
        send(orderId, fill(orderId + "-OK", orderId, "10"));

        awaitUntil(() -> executionCount(orderId) == 1, "the fill behind the two dead letters applied");
        Duration took = Duration.ofNanos(System.nanoTime() - sent);
        assertThat(deadLetters(orderId, TIMEOUT)).hasSize(2);
        assertThat(npe.get()).as("a null pointer is not retried").isEqualTo(1);
        assertThat(denied.get()).as("a permission error is not retried").isEqualTo(1);
        assertThat(took).as("no back-off spent on them").isLessThan(retryFor);
    }

    @Test
    void concurrencyConflictNeverDeadLettered() throws Exception {
        String orderId = createLiveOrder();
        long until = System.nanoTime() + retryFor.plusSeconds(1).toNanos();
        doAnswer(invocation -> {
            if (System.nanoTime() < until) {
                throw new ConcurrencyFailureException("order " + orderId + " changed meanwhile");
            }
            return invocation.callRealMethod();
        }).when(commandDispatcher).dispatch(argThat(fillOf(orderId, orderId + "-E1")), any());

        send(orderId, fill(orderId + "-E1", orderId, "10"));

        awaitUntil(() -> executionCount(orderId) == 1, "the fill applied once the conflict cleared, past the window");
        assertThat(deadLetters(orderId, Duration.ofSeconds(2))).isEmpty();
    }

    /** SPEC-0077 AC-9: the command listener's container runs with the policy's error handler. */
    @Test
    void listenerFactoryUsesThePolicy(@Autowired org.springframework.kafka.listener.DefaultErrorHandler commandErrorHandler) {
        MessageListenerContainer container = listeners.getListenerContainers().stream()
                .filter(c -> List.of(c.getContainerProperties().getTopics()).contains(TOPIC))
                .findFirst()
                .orElseThrow();
        for (var child : ((ConcurrentMessageListenerContainer<?, ?>) container).getContainers()) {
            assertThat(child.getCommonErrorHandler()).isSameAs(commandErrorHandler);
        }
    }

    private static org.mockito.ArgumentMatcher<Command> fillOf(String orderId, String execId) {
        return c -> c instanceof ExecutionCreateCmd fill && fill.getExecution() != null
                && orderId.equals(fill.getExecution().getOrderId()) && execId.equals(fill.getExecution().getExecId());
    }

    private double deadLettered(String exception) {
        var counter = meterRegistry.find(DeadLetterMetrics.DEAD_LETTERS)
                .tags("service", "oms-core", "topic", TOPIC, "side", "consumer", "exception", exception).counter();
        return counter == null ? 0 : counter.count();
    }

    private static String header(ConsumerRecord<?, ?> record, String key) {
        return new String(record.headers().lastHeader(key).value(), StandardCharsets.UTF_8);
    }

    /** The records on the dead-letter topic under this key, read for {@code wait} once the first arrives. */
    /** The listener group's committed offset on {@code partition} (the next to read), -1 when none. */
    private static long committed(TopicPartition partition) {
        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers()))) {
            var offset = admin.listConsumerGroupOffsets("oms-policy").partitionsToOffsetAndMetadata()
                    .get(10, java.util.concurrent.TimeUnit.SECONDS).get(partition);
            return offset == null ? -1 : offset.offset();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
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
            while (System.nanoTime() < deadline) {
                for (var record : consumer.poll(Duration.ofMillis(250))) {
                    if (key.equals(record.key())) {
                        found.add(record);
                    }
                }
            }
        }
        return found;
    }
}
