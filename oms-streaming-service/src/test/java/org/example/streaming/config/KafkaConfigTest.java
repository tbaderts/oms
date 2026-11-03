package org.example.streaming.config;

import static org.junit.jupiter.api.Assertions.assertSame;

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
        assertSame(registry, config.receiverOptions("oms_order_executions", registry).observationRegistry());
    }
}
