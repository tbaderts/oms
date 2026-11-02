package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.apache.avro.Schema;
import org.apache.avro.SchemaCompatibility;
import org.apache.avro.SchemaCompatibility.SchemaCompatibilityType;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Guards P-04 for every command record (SPEC-0025 AC-1).
 *
 * <p>Each command has its own Schema Registry subject, so each is checked on its own against a
 * frozen copy of its released schema in {@code compat/commands/<Record>.json}. The baselines are the
 * first release of the bare records (SPEC-0025; the envelope before it is intentionally
 * incompatible). Replace one only when a new version has actually been released.
 */
class CommandCompatibilityTest {

    static List<String> commands() throws IOException {
        return CommandSchemaTest.commandRecords();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("commands")
    void readsBaseline(String command) throws Exception {
        Schema current = CommandSchemaTest.classSchema(command);
        Schema baseline = loadBaseline(command);

        SchemaCompatibility.SchemaPairCompatibility result =
                SchemaCompatibility.checkReaderWriterCompatibility(current, baseline);

        assertEquals(
                SchemaCompatibilityType.COMPATIBLE,
                result.getType(),
                () -> command + " is not backward compatible: " + result.getDescription());
    }

    private static Schema loadBaseline(String command) throws IOException {
        String path = "/compat/commands/" + command + ".json";
        try (InputStream in = CommandCompatibilityTest.class.getResourceAsStream(path)) {
            assertNotNull(in, "missing baseline " + path);
            return new Schema.Parser().parse(in);
        }
    }
}
