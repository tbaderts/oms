package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import org.apache.avro.JsonProperties;
import org.apache.avro.Schema;
import org.junit.jupiter.api.Test;

/**
 * SPEC-0025 AC-1: every command is a bare record on the commands topic, starting with the shared
 * {@code CommandHeader}; the envelope and the unused schemas are gone.
 *
 * <p>The command records are discovered from the {@code *Cmd.avsc} files, so a new command is
 * checked without touching this test. Classes are loaded by name, so a missing record fails here
 * with a message instead of a compile error.
 */
public class CommandSchemaTest {

    static final String MSG = "org.example.common.model.msg.";
    static final Path AVRO_DIR = Path.of("src/main/avro");

    @Test
    void headerFieldsAsSpecified() throws Exception {
        Schema header = classSchema("CommandHeader");
        assertEquals(
                List.of("commandId", "correlationId", "causationId", "sentAt", "producer", "version"),
                header.getFields().stream().map(Schema.Field::name).toList());

        assertEquals(Schema.Type.STRING, header.getField("commandId").schema().getType());
        assertOptional(header, "correlationId");
        assertOptional(header, "causationId");
        Schema sentAt = header.getField("sentAt").schema();
        assertEquals(Schema.Type.LONG, sentAt.getType(), "sentAt is a required long");
        assertEquals("timestamp-micros", sentAt.getLogicalType().getName());
        assertEquals(Schema.Type.STRING, header.getField("producer").schema().getType());
        assertEquals(Schema.Type.STRING, header.getField("version").schema().getType());
        assertEquals("1.0.0", header.getField("version").defaultVal());
    }

    @Test
    void everyCommandStartsWithHeader() throws Exception {
        List<String> commands = commandRecords();
        assertEquals(13, commands.size(), () -> "command records: " + commands);

        for (String name : commands) {
            Schema schema = classSchema(name);
            Schema.Field first = schema.getFields().get(0);
            assertEquals("header", first.name(), name + " must start with header");
            assertEquals(MSG + "CommandHeader", first.schema().getFullName(), name + ".header type");
            assertNull(schema.getField("type"), name + " must not have a top-level type");
            assertNull(schema.getField("version"), name + " must not have a top-level version");
            assertNull(schema.getField("commandId"), name + ": commandId lives in the header");
        }
    }

    @Test
    void envelopeAndDeadSchemasAreGone() {
        for (String name : List.of("CommandMessage", "Command", "Cmd")) {
            assertFalse(Files.exists(AVRO_DIR.resolve(name + ".avsc")), name + ".avsc must be deleted");
            assertThrows(ClassNotFoundException.class, () -> Class.forName(MSG + name), name + " must not be generated");
        }
    }

    /** The simple names of every command record, from the {@code *Cmd.avsc} files. */
    public static List<String> commandRecords() throws IOException {
        try (Stream<Path> files = Files.list(AVRO_DIR)) {
            return files.map(p -> p.getFileName().toString())
                    .filter(f -> f.endsWith("Cmd.avsc"))
                    .map(f -> f.substring(0, f.length() - ".avsc".length()))
                    .sorted()
                    .toList();
        }
    }

    public static Schema classSchema(String simpleName) throws Exception {
        Class<?> type = Class.forName(MSG + simpleName);
        Schema schema = (Schema) type.getMethod("getClassSchema").invoke(null);
        assertNotNull(schema, simpleName);
        return schema;
    }

    private static void assertOptional(Schema record, String name) {
        Schema.Field field = record.getField(name);
        assertEquals(Schema.Type.UNION, field.schema().getType(), name + " must be a union with null");
        assertEquals(Schema.Type.NULL, field.schema().getTypes().get(0).getType(), name + " must list null first");
        assertTrue(field.hasDefaultValue(), name + " must have a default");
        assertEquals(JsonProperties.NULL_VALUE, field.defaultVal(), name + " must default to null");
    }
}
