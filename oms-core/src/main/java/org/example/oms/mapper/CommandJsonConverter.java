package org.example.oms.mapper;

import java.util.Map;

import org.example.common.model.cmd.Command;
import org.mapstruct.Named;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.DeserializationFeature;

/**
 * Turns a stored command into the free-form {@code transaction} object of an event-log entry
 * (SPEC-0035). Generated commands write their {@code type} only through {@code @JsonTypeInfo}, which
 * Jackson applies when the command is serialised as itself, not as a plain {@code Object}
 * property, so the command is converted here and keeps its {@code type}.
 */
@Component
@RequiredArgsConstructor
public class CommandJsonConverter {

    private final ObjectMapper objectMapper;

    @Named("toTransaction")
    public Object toTransaction(Command command) {
        return command == null ? null : objectMapper.convertValue(command, Map.class);
    }

    /** An event's stored {@code changes} JSON as an object, so the API returns it as JSON, not text (SPEC-0049). */
    @Named("toChanges")
    public Object toChanges(String changes) {
        // Decimals as BigDecimal: quantities and prices keep every stored digit, as orderSnapshot does.
        return changes == null
                ? null
                : objectMapper.readerFor(Map.class)
                        .with(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
                        .readValue(changes);
    }
}
