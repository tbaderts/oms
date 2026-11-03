package org.example.mcp;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import ch.qos.logback.classic.Logger;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;

/**
 * In the stdio profiles the MCP protocol owns stdout: log records go to the file and over OTLP,
 * never to the console (SPEC-0033 AC-4).
 */
@SpringBootTest(properties = "spring.main.web-application-type=reactive")
@ActiveProfiles({"test", "mcp"})
class McpLoggingConfigTest {

    @Test
    void stdioProfileHasNoConsoleAppender() {
        Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        assertNull(root.getAppender("CONSOLE"), "stdout must stay clean for the MCP stdio transport");
        assertNotNull(root.getAppender("FILE"));
        assertInstanceOf(OpenTelemetryAppender.class, root.getAppender("OTEL"));
    }
}
