package org.example.simulator.config;

import static io.opentelemetry.api.common.AttributeKey.stringKey;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import org.example.simulator.AbstractKafkaIntegrationTest;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.ConsoleAppender;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.logs.export.LogRecordExporter;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.export.SpanExporter;

/**
 * The simulator's OpenTelemetry setup comes from Spring Boot's starter (SPEC-0033): an SDK with the
 * service's resource, log records to the console and the OTEL appender, and no exporter at all
 * unless {@code OTLP_EXPORT_ENABLED} is set.
 */
@SpringBootTest
class TelemetryConfigurationTest extends AbstractKafkaIntegrationTest {

    @Autowired ApplicationContext context;
    @Autowired OpenTelemetry openTelemetry;
    @Autowired Resource resource;

    @Test
    void resourceAndNoCustomExporter() {
        assertInstanceOf(OpenTelemetrySdk.class, openTelemetry);
        assertEquals("oms-exchange-simulator", resource.getAttribute(stringKey("service.name")));
        assertEquals("oms", resource.getAttribute(stringKey("service.namespace")));
        assertEquals("local", resource.getAttribute(stringKey("deployment.environment")));

        Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        assertInstanceOf(ConsoleAppender.class, root.getAppender("CONSOLE"));
        assertInstanceOf(OpenTelemetryAppender.class, root.getAppender("OTEL"));
        assertEquals(1, context.getBeanNamesForType(OpenTelemetryLogging.class).length, "the appender is installed");
    }

    @Test
    void nothingExportedByDefault() throws ClassNotFoundException {
        // Only on the runtime classpath (the starter brings it in that scope).
        Class<?> otlpMeterRegistry = Class.forName("io.micrometer.registry.otlp.OtlpMeterRegistry");
        assertEquals(0, context.getBeanNamesForType(SpanExporter.class).length, "no span exporter");
        assertEquals(0, context.getBeanNamesForType(LogRecordExporter.class).length, "no log exporter");
        assertEquals(0, context.getBeanNamesForType(otlpMeterRegistry).length, "no OTLP meter registry");
    }
}
