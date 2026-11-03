package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.oms.OmsApplication;
import org.example.oms.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.filter.ServerHttpObservationFilter;

import tools.jackson.databind.json.JsonMapper;

/**
 * With export on, oms-core sends its spans, metrics and log records over OTLP to the configured
 * endpoint, here a {@link MockOtlpReceiver} (SPEC-0033 AC-2, AC-3, AC-4).
 *
 * <p>This context reads its own command topic with its own consumer group, so the cached contexts
 * of the other integration tests, still listening on {@code commands}, never take its records. It
 * does not extend {@link AbstractKafkaPostgresIntegrationTest}: that class's property source runs
 * after a subclass's and would set the topic back.
 */
@SpringBootTest(classes = OmsApplication.class)
class OtlpExportIntegrationTest {

    private static final String COMMAND_TOPIC = "commands-otlp-it";
    private static final Duration TIMEOUT = Duration.ofSeconds(30);

    static final MockOtlpReceiver otlp = MockOtlpReceiver.start();

    @DynamicPropertySource
    static void exportToTheMockReceiver(DynamicPropertyRegistry registry) {
        AbstractKafkaPostgresIntegrationTest.registerCommonProperties(registry);
        registry.add("OTLP_EXPORT_ENABLED", () -> "true");
        registry.add("OTLP_ENDPOINT", otlp::endpoint);
        registry.add("TRACING_SAMPLING_PROBABILITY", () -> "1.0");
        // Export quickly instead of every 5 s (spans, logs) and 15 s (metrics).
        registry.add("management.opentelemetry.tracing.export.schedule-delay", () -> "200ms");
        registry.add("management.opentelemetry.logging.export.schedule-delay", () -> "200ms");
        registry.add("management.otlp.metrics.export.step", () -> "1s");
        registry.add("kafka.command-topic", () -> COMMAND_TOPIC);
        registry.add("spring.kafka.consumer.group-id", () -> "oms-otlp-it");
    }

    @Autowired WebApplicationContext webApplicationContext;
    @Autowired ProducerFactory<Object, Object> producerFactory;
    @Autowired OrderRepository orderRepository;

    @Test
    void tracesMetricsAndLogsReachTheEndpoint() throws Exception {
        createOrderOverRest();

        otlp.await("/v1/traces",
                r -> r.contains("oms-core") && r.contains("/api/command/execute"),
                TIMEOUT, "the REST request's span from oms-core");
        otlp.await("/v1/metrics",
                r -> r.contains("oms-core") && r.contains("service.namespace") && r.contains("deployment.environment")
                        && r.contains("http.server.requests"),
                TIMEOUT, "oms-core's metrics with its resource attributes");
        otlp.await("/v1/logs", r -> r.contains("oms-core"), TIMEOUT, "oms-core's log records");
    }

    @Test
    void kafkaCommandContinuesTheProducersTrace() throws Exception {
        String orderId = createOrderOverRest();
        String traceId = acceptOverKafkaInTrace(orderId, UUID.randomUUID().toString());

        otlp.await("/v1/traces", r -> r.containsTraceId(traceId), TIMEOUT,
                "a consumer span in the producer's trace " + traceId);
    }

    @Test
    void logRecordsCarryTraceAndMdc() throws Exception {
        String orderId = createOrderOverRest();
        String commandId = UUID.randomUUID().toString();
        String traceId = acceptOverKafkaInTrace(orderId, commandId);

        otlp.await("/v1/logs",
                r -> r.containsTraceId(traceId)
                        && r.contains("Processed OrderAcceptCmd from Kafka")
                        && r.contains("org.example.oms.config.CommandListener")
                        && r.contains("INFO")
                        && r.contains("commandId")
                        && r.contains(commandId),
                TIMEOUT, "the listener's log record with trace " + traceId + " and commandId " + commandId);
    }

    /** Creates an order through the REST command API, through the HTTP observation filter. */
    private String createOrderOverRest() throws Exception {
        String body = mockMvc()
                .perform(post("/api/command/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"OrderCreateCmd\",\"version\":\"1.0.0\",\"order\":{"
                                + "\"sessionId\":\"SES-OTLP\",\"clOrdId\":\"CL-" + UUID.randomUUID() + "\","
                                + "\"symbol\":\"AAPL\",\"account\":\"ACC-OTLP\",\"ordType\":\"LIMIT\","
                                + "\"orderQty\":100,\"price\":170,\"side\":\"BUY\"}}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonMapper.builder().build().readTree(body).get("id").asString();
    }

    /**
     * Sends an OrderAcceptCmd as a producer in a sampled trace would, with a W3C {@code traceparent}
     * header, waits until the order is LIVE, and returns the trace id.
     */
    private String acceptOverKafkaInTrace(String orderId, String commandId) throws Exception {
        HexFormat hex = HexFormat.of();
        String traceId = hex.formatHex(randomBytes(16));
        String traceparent = "00-" + traceId + "-" + hex.formatHex(randomBytes(8)) + "-01";

        var record = new ProducerRecord<String, Object>(
                COMMAND_TOPIC, orderId, new OrderAcceptCmd(TestCommands.header(commandId), orderId));
        record.headers().add("traceparent", traceparent.getBytes(StandardCharsets.UTF_8));
        TestCommands.commandTemplate(producerFactory).send(record).get(10, TimeUnit.SECONDS);

        long deadline = System.nanoTime() + TIMEOUT.toNanos();
        while (System.nanoTime() < deadline && state(orderId) != State.LIVE) {
            Thread.sleep(100);
        }
        assertFalse(state(orderId) != State.LIVE, orderId + " did not become LIVE");
        return traceId;
    }

    private State state(String orderId) {
        return orderRepository.findByOrderId(orderId).map(Order::getState).orElse(null);
    }

    private static byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        ThreadLocalRandom.current().nextBytes(bytes);
        bytes[0] |= 1; // never all zero, which W3C treats as invalid
        return bytes;
    }

    /** MockMvc with the HTTP server observation filter, which a plain context setup leaves out. */
    private MockMvc mockMvc() {
        DefaultMockMvcBuilder builder = MockMvcBuilders.webAppContextSetup(webApplicationContext);
        webApplicationContext.getBeansOfType(FilterRegistrationBean.class).values().stream()
                .map(FilterRegistrationBean::getFilter)
                .filter(ServerHttpObservationFilter.class::isInstance)
                .forEach(builder::addFilters);
        return builder.build();
    }
}
