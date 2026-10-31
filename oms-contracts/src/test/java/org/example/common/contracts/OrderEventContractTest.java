package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.lang.reflect.AnnotatedElement;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.junit.jupiter.api.Test;

/**
 * SPEC-0035 AC-1: the query contract declares an event-log entry with exactly the contracted
 * properties, and the eight event kinds as an enum.
 *
 * <p>Loads the generated classes by name, so a missing schema fails here with a message instead of
 * a compile error.
 */
class OrderEventContractTest {

    private static final String QUERY_MODEL = "org.example.common.model.query.";

    @Test
    void orderEventDtoHasContractedProperties() throws ClassNotFoundException {
        Class<?> dto = Class.forName(QUERY_MODEL + "OrderEventDto");
        Set<String> properties = new TreeSet<>();
        Stream.concat(Arrays.stream(dto.getDeclaredFields()), Arrays.stream(dto.getDeclaredMethods()))
                .map(member -> ((AnnotatedElement) member).getAnnotation(JsonProperty.class))
                .filter(annotation -> annotation != null)
                .forEach(annotation -> properties.add(annotation.value()));

        assertEquals(
                new TreeSet<>(List.of(
                        "orderId", "version", "event", "commandId", "resultingState", "timeStamp",
                        "transaction", "orderSnapshot")),
                properties);
    }

    @Test
    void orderEventTypeHasEightKinds() throws ClassNotFoundException {
        Class<?> type = Class.forName(QUERY_MODEL + "OrderEventType");
        List<String> values = Arrays.stream(type.getEnumConstants()).map(c -> ((Enum<?>) c).name()).toList();

        assertEquals(
                List.of("NEW_ORDER", "ACK", "PARTIAL_FILL", "FILL", "CXL", "REJ", "CXL_REQUEST", "CXL_REJ"),
                values);
    }
}
