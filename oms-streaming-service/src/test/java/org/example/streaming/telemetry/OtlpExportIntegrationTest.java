package org.example.streaming.telemetry;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.State;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import io.confluent.kafka.serializers.KafkaAvroSerializer;

/**
 * With export on, the streaming service sends its spans, metrics and log records over OTLP to the
 * configured endpoint, here a {@link MockOtlpReceiver} (SPEC-0033 AC-2). An order update with a
 * {@code traceparent} header is received in the producer's trace (AC-3, oms-core → streaming).
 */
@SpringBootTest(properties = {
    "streaming.kafka.enabled=true",
    "streaming.kafka.topics.orders=orders-otlp-it",
    "streaming.kafka.topics.order-executions=order-executions-otlp-it",
    "spring.kafka.bootstrap-servers=${spring.embedded.kafka.brokers}",
    "spring.kafka.consumer.group-id=streaming-otlp-it",
    "spring.kafka.properties.schema.registry.url=" + OtlpExportIntegrationTest.REGISTRY,
    "spring.rsocket.server.port=0",
    "server.port=0"
})
@EmbeddedKafka(partitions = 1, topics = {"orders-otlp-it", "order-executions-otlp-it"})
class OtlpExportIntegrationTest {

    static final String REGISTRY = "mock://streaming-otlp-it";
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

    @Value("${spring.embedded.kafka.brokers}")
    String brokers;

    @Test
    void orderUpdateIsReceivedInTheProducersTraceAndExported() throws Exception {
        String traceId = "0af7651916cd43dd8448eb211c80319c";
        String orderId = "ORD-" + UUID.randomUUID();
        OrderMessage order = new OrderMessage();
        order.setOrderId(orderId);
        order.setRootOrderId(orderId);
        order.setSymbol("AAPL");
        order.setState(State.LIVE);
        order.setEventId(1L);

        var record = new ProducerRecord<String, Object>("orders-otlp-it", orderId, order);
        record.headers().add("traceparent", ("00-" + traceId + "-b7ad6b7169203331-01").getBytes(StandardCharsets.UTF_8));
        send(record);

        otlp.await("/v1/traces",
                r -> r.contains("oms-streaming-service") && r.containsTraceId(traceId),
                TIMEOUT, "the streaming service's consumer span in the producer's trace " + traceId);
        otlp.await("/v1/metrics",
                r -> r.contains("oms-streaming-service") && r.contains("service.namespace") && r.contains("deployment.environment"),
                TIMEOUT, "the streaming service's metrics with its resource attributes");
        otlp.await("/v1/logs", r -> r.contains("oms-streaming-service"), TIMEOUT, "the streaming service's log records");
    }

    private void send(ProducerRecord<String, Object> record) throws Exception {
        Map<String, Object> producer = new HashMap<>();
        producer.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, brokers);
        producer.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        producer.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, KafkaAvroSerializer.class);
        producer.put("schema.registry.url", REGISTRY);
        try (var kafka = new KafkaProducer<String, Object>(producer)) {
            kafka.send(record).get(10, TimeUnit.SECONDS);
        }
    }
}
