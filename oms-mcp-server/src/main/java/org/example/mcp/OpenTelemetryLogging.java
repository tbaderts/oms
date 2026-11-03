package org.example.mcp;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.stereotype.Component;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;
import lombok.RequiredArgsConstructor;

/**
 * Connects the {@code OTEL} appender of {@code logback-spring.xml} to the SDK Spring Boot creates,
 * which Boot does not do itself (SPEC-0033). The appender keeps the records logged before this runs
 * and replays them on install.
 */
@Component
@RequiredArgsConstructor
public class OpenTelemetryLogging implements InitializingBean {

    private final OpenTelemetry openTelemetry;

    @Override
    public void afterPropertiesSet() {
        OpenTelemetryAppender.install(openTelemetry);
    }
}
