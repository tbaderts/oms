package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.avro.Schema;
import org.apache.avro.SchemaCompatibility;
import org.apache.avro.SchemaCompatibility.SchemaCompatibilityType;
import org.example.common.model.msg.CommandMessage;
import org.junit.jupiter.api.Test;

/**
 * Guards P-04 for the command envelope.
 *
 * <p>{@code CommandMessage} embeds every command record, so checking it against a frozen copy of the
 * previously published schema covers all of them at once. The baseline is the resolved schema as it
 * stood before SPEC-0001; replace it only when a new version has actually been released.
 */
class CommandMessageCompatibilityTest {

    private static final String BASELINE = "/compat/CommandMessage-baseline.json";

    @Test
    void newSchemaReadsBaselineData() throws IOException {
        Schema baseline = loadBaseline();
        Schema current = CommandMessage.getClassSchema();

        SchemaCompatibility.SchemaPairCompatibility result =
                SchemaCompatibility.checkReaderWriterCompatibility(current, baseline);

        assertEquals(
                SchemaCompatibilityType.COMPATIBLE,
                result.getType(),
                () -> "CommandMessage is not backward compatible: " + result.getDescription());
    }

    @Test
    void commandUnionCarriesLifecycleCommands() {
        Set<String> branches =
                CommandMessage.getClassSchema().getField("command").schema().getTypes().stream()
                        .map(Schema::getName)
                        .collect(Collectors.toSet());

        for (String name :
                List.of(
                        "OrderRejectCmd",
                        "OrderCancelCmd",
                        "OrderCancelRequestCmd",
                        "OrderCancelRejectCmd")) {
            assertTrue(branches.contains(name), () -> "CommandMessage union lacks " + name);
        }
    }

    private static Schema loadBaseline() throws IOException {
        try (InputStream in = CommandMessageCompatibilityTest.class.getResourceAsStream(BASELINE)) {
            return new Schema.Parser().parse(in);
        }
    }
}
