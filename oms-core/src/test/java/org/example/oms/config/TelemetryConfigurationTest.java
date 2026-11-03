package org.example.oms.config;

import static io.opentelemetry.api.common.AttributeKey.stringKey;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import org.example.oms.integration.AbstractKafkaPostgresIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.logs.export.LogRecordExporter;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.export.SpanExporter;

/**
 * oms-core's OpenTelemetry setup comes from Spring Boot's starter (SPEC-0033): an SDK with the
 * service's resource, and no exporter at all unless {@code OTLP_EXPORT_ENABLED} is set.
 */
class TelemetryConfigurationTest extends AbstractKafkaPostgresIntegrationTest {

    @Autowired ApplicationContext context;
    @Autowired Environment environment;
    @Autowired OpenTelemetry openTelemetry;
    @Autowired Resource resource;

    @Test
    void resourceAndNoCustomExporter() {
        assertInstanceOf(OpenTelemetrySdk.class, openTelemetry);
        assertEquals("oms-core", resource.getAttribute(stringKey("service.name")));
        assertEquals("oms", resource.getAttribute(stringKey("service.namespace")));
        assertEquals("local", resource.getAttribute(stringKey("deployment.environment")));

        assertFalse(environment.containsProperty("tracing.enabled"), "tracing.enabled is gone");
        assertFalse(environment.containsProperty("tracing.url"), "tracing.url is gone");
        assertFalse(context.containsBean("otlpGrpcSpanExporter"), "no hand-made span exporter");
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
