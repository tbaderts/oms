package org.example.oms.config;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.example.oms.integration.AbstractKafkaPostgresIntegrationTest;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.encoder.PatternLayoutEncoder;
import ch.qos.logback.core.ConsoleAppender;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;

/**
 * Every log line goes both to the console, readable as before, and to OpenTelemetry's appender,
 * which exports it over OTLP when export is on (SPEC-0033).
 */
class LoggingConfigTest extends AbstractKafkaPostgresIntegrationTest {

    @Autowired OpenTelemetryLogging openTelemetryLogging;

    private final Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);

    @Test
    void rootLogsToTheConsoleAndOpenTelemetry() {
        assertInstanceOf(OpenTelemetryAppender.class, root.getAppender("OTEL"));
        // The installer runs at startup; OtlpExportIntegrationTest proves the appender then exports.
        assertNotNull(openTelemetryLogging, "the installer bean exists");
    }

    @Test
    void consoleKeepsTheCorrelationBlock() {
        var console = assertInstanceOf(ConsoleAppender.class, root.getAppender("CONSOLE"));
        String pattern = assertInstanceOf(PatternLayoutEncoder.class, console.getEncoder()).getPattern();
        assertTrue(pattern.contains("%X{commandId:-}"), pattern);
        assertTrue(pattern.contains("%X{traceId:-}"), pattern);
    }
}
