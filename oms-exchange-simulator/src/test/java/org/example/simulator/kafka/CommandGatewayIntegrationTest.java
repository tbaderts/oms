package org.example.simulator.kafka;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.example.simulator.AbstractKafkaIntegrationTest;
import org.example.simulator.engine.Cause;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.ProducerFactory;

/**
 * SPEC-0077 AC-6 for the simulator's command producer: while the broker is unreachable for a while
 * (shorter than the window), the producer client keeps retrying; the command arrives once, nothing is
 * dead-lettered, and the producer's delivery timeout is the error policy's window.
 */
@SpringBootTest(
        properties = {
            "simulator.order-topic=orders-gateway",
            "simulator.command-topic=" + CommandGatewayIntegrationTest.COMMANDS,
            "simulator.reference-prices.AAPL=170.00",
            "spring.kafka.consumer.group-id=exchange-simulator-gateway-it",
            "kafka.error-policy.retry-for=PT40S",
            "kafka.error-policy.initial-interval=PT0.1S",
            "kafka.error-policy.max-interval=PT1S"
        })
class CommandGatewayIntegrationTest extends AbstractKafkaIntegrationTest {

    static final String COMMANDS = "commands-gateway";

    @Autowired CommandGateway gateway;
    @Autowired ProducerFactory<String, Object> producerFactory;

    @Test
    void producerDeliveryTimeoutFollowsRetryFor() {
        Map<String, Object> config = producerFactory.getConfigurationProperties();
        assertThat(config).containsEntry(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 40_000);
        assertThat(config).containsEntry(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 30_000);
    }

    @Test
    void pausedBrokerDeliveredOnceWithinWindow() throws Exception {
        String orderId = "ORD-" + UUID.randomUUID();
        // Warm the producer up (metadata for the topic) so the paused send fails on the broker, not metadata.
        gateway.accept(new Cause(orderId, orderId, 1L), orderId);
        assertThat(records(COMMANDS, orderId, 1, Duration.ofSeconds(20))).hasSize(1);

        var docker = kafka.getDockerClient();
        docker.pauseContainerCmd(kafka.getContainerId()).exec();
        CompletableFuture<Void> sent;
        try {
            sent = gateway.send(orderId, new org.example.common.model.msg.OrderAcceptCmd(
                    new CommandHeaders("oms-exchange-simulator").build(new Cause(orderId, orderId, 2L), null), orderId));
            Thread.sleep(5_000);
            assertThat(sent).as("still being retried while the broker is away").isNotDone();
        } finally {
            docker.unpauseContainerCmd(kafka.getContainerId()).exec();
        }
        sent.get(60, TimeUnit.SECONDS);

        assertThat(records(COMMANDS, orderId, 2, Duration.ofSeconds(20))).as("the paused send arrived, once").hasSize(2);
        assertThat(records(COMMANDS + ".oms-exchange-simulator.DLT", orderId, 1, Duration.ofSeconds(3))).isEmpty();
    }

    private static List<byte[]> records(String topic, String key, int expected, Duration wait) {
        Map<String, Object> config = Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "it-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        List<byte[]> found = new ArrayList<>();
        try (KafkaConsumer<String, byte[]> consumer = new KafkaConsumer<>(config)) {
            consumer.subscribe(List.of(topic));
            long deadline = System.nanoTime() + wait.toNanos();
            while (System.nanoTime() < deadline && found.size() < expected) {
                for (var record : consumer.poll(Duration.ofMillis(250))) {
                    if (key.equals(record.key())) {
                        found.add(record.value());
                    }
                }
            }
            for (var record : consumer.poll(Duration.ofMillis(500))) {
                if (key.equals(record.key())) {
                    found.add(record.value());
                }
            }
        }
        return found;
    }
}
