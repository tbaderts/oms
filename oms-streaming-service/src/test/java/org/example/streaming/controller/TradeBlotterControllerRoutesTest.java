package org.example.streaming.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.handler.annotation.MessageMapping;

/**
 * SPEC-0071 AC-6: only the routes oms-ui uses remain. {@code blotter.stream}, {@code orders.snapshot}
 * and {@code executions.snapshot} served the former cache; with no handler for them, a request gets
 * an error.
 */
class TradeBlotterControllerRoutesTest {

    @Test
    void onlyTheUsedRoutesRemain() {
        Set<String> routes = Arrays.stream(TradeBlotterController.class.getDeclaredMethods())
                .filter(m -> m.isAnnotationPresent(MessageMapping.class))
                .flatMap(m -> Arrays.stream(m.getAnnotation(MessageMapping.class).value()))
                .collect(Collectors.toSet());

        assertEquals(Set.of("orders.stream", "executions.stream", "health"), routes);
    }
}
