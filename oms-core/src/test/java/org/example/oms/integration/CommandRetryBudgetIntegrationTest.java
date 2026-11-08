package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.oms.config.KafkaTopicProvisioner;
import org.example.oms.service.command.CommandDispatcher;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.test.utils.ContainerTestUtils;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0048 AC-2, second half: a failure that is not a concurrency failure keeps the bounded retry
 * budget and is dead-lettered once it is spent, as before. (The first half, a conflict retried past
 * the budget and never dead-lettered, is {@code OrderVersionIntegrationTest#kafkaFillRetriedAfterAConflict}.)
 *
 * <p>Runs in a world of its own, so its spied dispatcher is the only consumer of its command topic.
 */
class CommandRetryBudgetIntegrationTest extends AbstractFillFlowIntegrationTest {

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        isolate("budget", "commands-budget");
        registry.add("spring.kafka.consumer.group-id", () -> "oms-budget");
    }

    @MockitoSpyBean CommandDispatcher commandDispatcher;
    @Autowired MeterRegistry meterRegistry;
    @Value("${kafka.consumer.retry-attempts}") int retryAttempts;
    @Autowired KafkaListenerEndpointRegistry listeners;
    @Autowired KafkaTopicProvisioner provisioner;

    @Test
    void aRetryableNonConcurrencyFailureIsDeadLetteredAfterTheBudget() throws Exception {
        String orderId = "ORD-BUDGET-" + UUID.randomUUID();
        doThrow(new IllegalStateException("database unavailable"))
                .when(commandDispatcher)
                .dispatch(argThat((Command c) -> c instanceof ExecutionCreateCmd fill
                        && fill.getExecution() != null && orderId.equals(fill.getExecution().getOrderId())), any());
        // The budget is counted per consumer. A rebalance while the listener's consumers are still
        // joining hands the record to another consumer, which counts afresh, so wait until every
        // partition is assigned before sending.
        MessageListenerContainer container = listeners.getListenerContainers().stream()
                .filter(c -> List.of(c.getContainerProperties().getTopics()).contains("commands-budget"))
                .findFirst()
                .orElseThrow();
        ContainerTestUtils.waitForAssignment(container, provisioner.commandPartitions());
        double failedBefore = failed();

        send(orderId, fill(orderId + "-E1", orderId, "10"));

        assertEquals(1, deadLetters("commands-budget.DLT", orderId), "dead-lettered once the budget is spent");
        assertEquals(retryAttempts + 1, failed() - failedBefore, 0.0, "the first attempt and every retry, then no more");
    }

    private double failed() {
        var counter = meterRegistry.find("oms.commands.consumed").tag("type", "ExecutionCreateCmd").tag("outcome", "failed").counter();
        return counter == null ? 0 : counter.count();
    }

    private static int deadLetters(String topic, String key) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "it-dlt-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        int count = 0;
        try (KafkaConsumer<String, byte[]> consumer = new KafkaConsumer<>(config)) {
            consumer.subscribe(List.of(topic));
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (count == 0 && System.nanoTime() < deadline) {
                for (var record : consumer.poll(Duration.ofMillis(250))) {
                    if (key.equals(record.key())) {
                        count++;
                    }
                }
            }
            for (var record : consumer.poll(Duration.ofSeconds(1))) {
                if (key.equals(record.key())) {
                    count++;
                }
            }
        }
        return count;
    }
}
