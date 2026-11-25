package org.example.streaming.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.util.List;
import org.apache.kafka.clients.consumer.ConsumerConfig;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import io.micrometer.observation.ObservationRegistry;

/**
 * Both receivers observe each record, so a consumer span continues the trace of the oms-core
 * producer that sent it (SPEC-0033 AC-3).
 */
class KafkaConfigTest {

    @Test
    void receiversObserveRecords() {
        KafkaConfig config = new KafkaConfig();
        ReflectionTestUtils.setField(config, "bootstrapServers", "localhost:9092");
        ReflectionTestUtils.setField(config, "groupId", "streaming-it");
        ReflectionTestUtils.setField(config, "schemaRegistryUrl", "mock://streaming-it");
        ObservationRegistry registry = ObservationRegistry.create();

        assertSame(registry, config.receiverOptions("oms_orders", registry).observationRegistry());
        assertSame(registry, config.executionReceiverOptions(registry).observationRegistry());
    }

    /**
     * SPEC-0071 AC-3: live fills come from oms_executions, not oms_order_executions, and a first start
     * reads new fills only: history comes from the database snapshot.
     */
    @Test
    void executionReceiverReadsOmsExecutionsFromLatest() {
        KafkaConfig config = new KafkaConfig();
        ReflectionTestUtils.setField(config, "bootstrapServers", "localhost:9092");
        ReflectionTestUtils.setField(config, "groupId", "streaming-it");
        ReflectionTestUtils.setField(config, "schemaRegistryUrl", "mock://streaming-it");
        ReflectionTestUtils.setField(config, "executionsTopic", "oms_executions");

        var options = config.executionReceiverOptions(ObservationRegistry.create());

        assertEquals(List.of("oms_executions"), List.copyOf(options.subscriptionTopics()));
        assertEquals("latest", options.consumerProperty(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG));
        assertEquals("earliest", config.receiverOptions("oms_orders", ObservationRegistry.create())
                .consumerProperty(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG), "orders unchanged");
    }
}
