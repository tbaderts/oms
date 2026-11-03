package org.example.mcp.telemetry;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * With export on, the MCP server sends its spans, metrics and log records over OTLP to the
 * configured endpoint, here a {@link MockOtlpReceiver} (SPEC-0033 AC-2). Runs as the HTTP server it
 * is under docker-compose; over stdio there are no HTTP requests to trace.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT, properties = "spring.main.web-application-type=reactive")
// "mcp" selects the stdio logging (file and OTLP); "test" alone matches no root in logback-spring.xml.
@ActiveProfiles({"test", "mcp"})
class OtlpExportIntegrationTest {

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

    @LocalServerPort int port;

    @Test
    void tracesMetricsAndLogsReachTheEndpoint() throws Exception {
        WebClient.create("http://localhost:" + port).get().uri("/v3/api-docs")
                .exchangeToMono(response -> response.releaseBody())
                .block(Duration.ofSeconds(10));

        otlp.await("/v1/traces",
                r -> r.contains("oms-mcp-server") && r.contains("/v3/api-docs"),
                TIMEOUT, "the HTTP request's span from oms-mcp-server");
        otlp.await("/v1/metrics",
                r -> r.contains("oms-mcp-server") && r.contains("service.namespace") && r.contains("deployment.environment"),
                TIMEOUT, "oms-mcp-server's metrics with its resource attributes");
        otlp.await("/v1/logs", r -> r.contains("oms-mcp-server"), TIMEOUT, "oms-mcp-server's log records");
    }
}
