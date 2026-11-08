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
 * SPEC-0046 AC-10: the query contract declares a command-log entry with exactly the contracted
 * properties, and its source and outcome enums.
 *
 * <p>Loads the generated classes by name, so a missing schema fails here with a message instead of
 * a compile error.
 */
class CommandLogContractTest {

    private static final String QUERY_MODEL = "org.example.common.model.query.";

    @Test
    void commandLogEntryDtoHasContractedProperties() throws ClassNotFoundException {
        Class<?> dto = Class.forName(QUERY_MODEL + "CommandLogEntryDto");
        Set<String> properties = new TreeSet<>();
        Stream.concat(Arrays.stream(dto.getDeclaredFields()), Arrays.stream(dto.getDeclaredMethods()))
                .map(member -> ((AnnotatedElement) member).getAnnotation(JsonProperty.class))
                .filter(annotation -> annotation != null)
                .forEach(annotation -> properties.add(annotation.value()));

        assertEquals(
                new TreeSet<>(List.of(
                        "commandId", "type", "orderId", "receivedAt", "source", "principal", "outcome", "reason",
                        "eventVersion")),
                properties);
    }

    @Test
    void sourceAndOutcomeEnums() throws ClassNotFoundException {
        assertEquals(List.of("REST", "KAFKA", "SCHEDULER"), names(QUERY_MODEL + "CommandSource"));
        assertEquals(List.of("APPLIED", "REFUSED", "FAILED"), names(QUERY_MODEL + "CommandOutcome"));
    }

    private static List<String> names(String type) throws ClassNotFoundException {
        return Arrays.stream(Class.forName(type).getEnumConstants()).map(c -> ((Enum<?>) c).name()).toList();
    }
}
