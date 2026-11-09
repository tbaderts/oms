package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

import jakarta.validation.constraints.NotNull;

/**
 * SPEC-0025 AC-2: the command API's {@code Command} base carries the header fields every Kafka
 * command has, as optional properties, and the API version records the addition.
 */
class CommandBaseContractTest {

    private static final String CMD_MODEL = "org.example.common.model.cmd.";

    @Test
    void baseCarriesHeaderFields() throws Exception {
        Class<?> base = Class.forName(CMD_MODEL + "Command");
        assertEquals(String.class, getter(base, "getCommandId").getReturnType());
        assertEquals(String.class, getter(base, "getCorrelationId").getReturnType());
        assertEquals(String.class, getter(base, "getCausationId").getReturnType());
        assertEquals(OffsetDateTime.class, getter(base, "getSentAt").getReturnType());

        // Optional: only the discriminator is required.
        assertTrue(getter(base, "getType").isAnnotationPresent(NotNull.class), "type is required");
        for (String optional : List.of("getCommandId", "getCorrelationId", "getCausationId", "getSentAt")) {
            assertFalse(getter(base, optional).isAnnotationPresent(NotNull.class), optional + " is optional");
        }

        // The lifecycle commands inherit commandId rather than declaring their own.
        for (String lifecycle : List.of("OrderRejectCmd", "OrderCancelCmd", "OrderCancelRequestCmd", "OrderCancelRejectCmd")) {
            Class<?> type = Class.forName(CMD_MODEL + lifecycle);
            assertEquals(base, type.getMethod("getCommandId").getDeclaringClass(), lifecycle + " inherits commandId");
        }
    }

    @Test
    void versionIs340() throws IOException {
        Matcher version = Pattern.compile("(?m)^info:\\s*\\n(?:\\s+.*\\n)*?\\s+version:\\s*(\\S+)").matcher(commandContract());
        assertTrue(version.find(), "info.version");
        // 3.3.0: the 409 response on /execute (SPEC-0046); 3.4.0: expectedVersion and eventVersion (SPEC-0050)
        assertEquals("3.4.0", version.group(1));
    }

    /**
     * SPEC-0050 AC-7: a command may say which order version it acted on, and the result says which
     * version the command produced. Both optional, additive.
     */
    @Test
    void expectedVersionAndEventVersionAreOptionalInt64() throws Exception {
        Class<?> base = Class.forName(CMD_MODEL + "Command");
        assertEquals(Long.class, getter(base, "getExpectedVersion").getReturnType());
        assertFalse(getter(base, "getExpectedVersion").isAnnotationPresent(NotNull.class), "expectedVersion is optional");

        Class<?> result = Class.forName(CMD_MODEL + "CommandResult");
        assertEquals(Long.class, getter(result, "getEventVersion").getReturnType());
        assertFalse(getter(result, "getEventVersion").isAnnotationPresent(NotNull.class), "eventVersion is optional");

        org.apache.avro.Schema.Field header = org.example.common.model.msg.CommandHeader.getClassSchema().getField("expectedVersion");
        assertTrue(header != null, "CommandHeader.expectedVersion exists");
        assertEquals("[\"null\",\"long\"]", header.schema().toString(), "nullable long");
        assertTrue(header.hasDefaultValue() && header.defaultVal() == org.apache.avro.JsonProperties.NULL_VALUE, "default null");

        try (InputStream in = CommandBaseContractTest.class.getResourceAsStream("/META-INF/oms-contracts/openapi/oms-query-api.yml")) {
            String query = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(query.contains("Read-your-writes"), "the query contract documents read-your-writes on eventVersion");
        }
    }

    private static Method getter(Class<?> type, String name) throws NoSuchMethodException {
        return type.getDeclaredMethod(name);
    }

    private static String commandContract() throws IOException {
        try (InputStream in = CommandBaseContractTest.class.getResourceAsStream("/META-INF/oms-contracts/openapi/oms-cmd-api.yml")) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
