package org.example.simulator.telemetry;

import static org.example.simulator.engine.TestOrders.market;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.simulator.AbstractKafkaIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import io.confluent.kafka.serializers.KafkaAvroSerializer;

/**
 * With export on, the simulator sends its spans, metrics and log records over OTLP to the
 * configured endpoint, here a {@link MockOtlpReceiver} (SPEC-0033 AC-2). Own topics and consumer
 * group, so the other test contexts never see its orders.
 */
@SpringBootTest(
        properties = {
            "simulator.order-topic=orders-otlp-it",
            "simulator.command-topic=commands-otlp-it",
            "simulator.fill-slices=1",
            "simulator.fill-delay=0ms",
            "simulator.reference-prices.AAPL=170.00",
            "spring.kafka.consumer.group-id=exchange-simulator-otlp-it",
            "spring.kafka.consumer.auto-offset-reset=earliest"
        })
class OtlpExportIntegrationTest extends AbstractKafkaIntegrationTest {

    private static final Duration TIMEOUT = Duration.ofSeconds(30);

    static final MockOtlpReceiver otlp = MockOtlpReceiver.start();

    @DynamicPropertySource
    static void exportToTheMockReceiver(DynamicPropertyRegistry registry) {
        registry.add("OTLP_EXPORT_ENABLED", () -> "true");
        registry.add("OTLP_ENDPOINT", otlp::endpoint);
        registry.add("TRACING_SAMPLING_PROBABILITY", () -> "1.0");
        // Export quickly instead of every 5 s (spans, logs) and 15 s (metrics).
        registry.add("management.opentelemetry.tracing.export.schedule-delay", () -> "200ms");
        registry.add("management.opentelemetry.logging.export.schedule-delay", () -> "200ms");
        registry.add("management.otlp.metrics.export.step", () -> "1s");
    }

    @Test
    void tracesMetricsAndLogsReachTheEndpoint() throws Exception {
        String orderId = "ORD-" + UUID.randomUUID();
        publish(market(orderId, Side.BUY, "100"));

        otlp.await("/v1/traces",
                r -> r.contains("oms-exchange-simulator") && r.contains("orders-otlp-it"),
                TIMEOUT, "the simulator's consumer span");
        otlp.await("/v1/metrics",
                r -> r.contains("oms-exchange-simulator") && r.contains("service.namespace") && r.contains("deployment.environment"),
                TIMEOUT, "the simulator's metrics with its resource attributes");
        otlp.await("/v1/logs",
                r -> r.contains("oms-exchange-simulator") && r.contains(orderId),
                TIMEOUT, "a log record about " + orderId);
    }

    private static void publish(OrderMessage message) throws Exception {
        Map<String, Object> producer = new HashMap<>();
        producer.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
        producer.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        producer.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, KafkaAvroSerializer.class);
        producer.put("schema.registry.url", REGISTRY);
        var factory = new DefaultKafkaProducerFactory<String, Object>(producer);
        try {
            new KafkaTemplate<>(factory).send("orders-otlp-it", message.getOrderId(), message).get(10, TimeUnit.SECONDS);
        } finally {
            factory.destroy();
        }
    }
}
