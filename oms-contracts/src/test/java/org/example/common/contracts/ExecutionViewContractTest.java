package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.AnnotatedElement;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.junit.jupiter.api.Test;

/**
 * SPEC-0020 AC-5: the query contract declares GET /executions with its filters, and the fill view's
 * properties: the fill, the order as of that fill, orderVersion and tradeDate.
 *
 * <p>Loads the generated DTO by name, so a missing schema fails here with a message instead of a
 * compile error.
 */
class ExecutionViewContractTest {

    private static final String QUERY_MODEL = "org.example.common.model.query.";

    @Test
    void queryContractDeclaresGetExecutionsWithItsFilters() throws IOException {
        String spec = queryContract();
        assertTrue(spec.contains("\n  /executions:\n"), "path /executions");
        assertTrue(spec.contains("operationId: getExecutions"), "operationId getExecutions");
        for (String parameter : List.of("orderId", "rootOrderId", "account", "transactTimeFrom", "transactTimeTo", "limit")) {
            assertTrue(spec.contains("name: " + parameter), "parameter " + parameter);
        }
    }

    @Test
    void executionViewDtoHasContractedProperties() throws ClassNotFoundException {
        Class<?> dto = Class.forName(QUERY_MODEL + "ExecutionViewDto");
        Set<String> properties = new TreeSet<>();
        Stream.concat(Arrays.stream(dto.getDeclaredFields()), Arrays.stream(dto.getDeclaredMethods()))
                .map(member -> ((AnnotatedElement) member).getAnnotation(JsonProperty.class))
                .filter(annotation -> annotation != null)
                .forEach(annotation -> properties.add(annotation.value()));

        assertEquals(
                new TreeSet<>(List.of(
                        "orderId", "execId", "rootOrderId", "parentOrderId", "leg", "clOrdId", "sessionId",
                        "account", "side", "symbol", "securityId", "ordType", "price", "orderQty",
                        "settlCurrency", "exDestination", "lastQty", "lastPx", "execType", "lastCapacity",
                        "lastMkt", "transactTime", "cumQty", "leavesQty", "avgPx", "state", "orderVersion",
                        "tradeDate")),
                properties);
    }

    private static String queryContract() throws IOException {
        try (InputStream in = ExecutionViewContractTest.class.getResourceAsStream(
                "/META-INF/oms-contracts/openapi/oms-query-api.yml")) {
            assertNotNull(in, "oms-query-api.yml in the contracts jar");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).replace("\r\n", "\n");
        }
    }
}
