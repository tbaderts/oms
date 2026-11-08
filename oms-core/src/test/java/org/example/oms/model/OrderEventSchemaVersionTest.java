package org.example.oms.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import org.example.common.model.Order;
import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.oms.replay.StoredEvent;
import org.example.oms.replay.StoredEventDecoder;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Golden-file fixtures of legacy event JSON, locked against the current model (SPEC-0024). Each
 * fixture is an {@code order_events} row as stored before the {@code schema_version} column
 * existed; the upcasting rule treats it as version 1. A failure here means the model moved away
 * from history: add the upcast step to {@link StoredEventDecoder}, not a change to the fixture.
 */
class OrderEventSchemaVersionTest {

    private static final ObjectMapper JSON = JsonMapper.builder().build();

    private static final Path FIXTURES = Path.of("src/test/resources/fixtures/order-events");

    private final StoredEventDecoder decoder = new StoredEventDecoder();

    static Stream<Named<Path>> legacyFixtures() throws IOException {
        List<Named<Path>> fixtures;
        try (Stream<Path> files = Files.list(FIXTURES)) {
            fixtures = files
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .sorted()
                    .map(p -> Named.of(p.getFileName().toString(), p))
                    .toList();
        }
        assertFalse(fixtures.isEmpty(), "the golden fixtures are missing from " + FIXTURES);
        return fixtures.stream();
    }

    /** AC-4: each fixture decodes to the current model, treated as schema version 1. */
    @ParameterizedTest
    @MethodSource("legacyFixtures")
    void readsLegacyFixtureAsVersionOneAndDecodesCommand(Path fixture) throws IOException {
        JsonNode row = JSON.readTree(Files.readString(fixture));
        assertFalse(row.has("schema_version"), "the fixture is legacy: it has no schema_version");

        StoredEvent event = decoder.decodeRow(row);

        assertTrue(event.legacy(), "a row without schema_version is legacy");
        assertEquals(1, event.schemaVersion(), "a legacy row is schema version 1");
        assertEquals(row.get("order_id").asString(), event.orderId());
        assertEquals(row.get("version").asLong(), event.version());

        Command command = event.command();
        assertNotNull(command, "the stored command decodes");
        String type = row.get("transaction").get("type").asString();
        assertEquals(type, command.getType());
        Class<? extends Command> expected =
                type.equals("ExecutionCreateCmd") ? ExecutionCreateCmd.class : OrderCreateCmd.class;
        assertTrue(expected.isInstance(command), "decodes to " + expected.getSimpleName() + ", was " + command.getClass());
        if (command instanceof ExecutionCreateCmd fill) {
            assertEquals(event.orderId(), fill.getExecution().getOrderId(), "the fill names the fixture's order");
        }

        Order snapshot = event.snapshot();
        assertEquals(event.orderId(), snapshot.getOrderId(), "the snapshot is the fixture's order");
        assertEquals(row.get("order_snapshot").get("state").asString(), snapshot.getState().name());
        assertEquals(0, row.get("order_snapshot").get("cumQty").decimalValue().compareTo(snapshot.getCumQty()));
    }

    /**
     * AC-4, and the point of the fixtures (architecture review finding 8): no field of a legacy row
     * is lost on read. Every field the fixture holds must come back, with its value, when the
     * decoded command and snapshot are encoded again. A field the model renamed or dropped fails
     * here, where the generated models' ignore-unknown would otherwise lose it silently.
     */
    @ParameterizedTest
    @MethodSource("legacyFixtures")
    void legacyFixtureLosesNoFieldOnRead(Path fixture) throws IOException {
        JsonNode row = JSON.readTree(Files.readString(fixture));

        StoredEvent event = decoder.decodeRow(row);

        List<String> lost = new java.util.ArrayList<>();
        collectLost("transaction", row.get("transaction"), JSON.valueToTree(event.command()), lost);
        collectLost("order_snapshot", row.get("order_snapshot"), JSON.valueToTree(event.snapshot()), lost);
        assertTrue(lost.isEmpty(), fixture.getFileName() + " loses fields on read: " + lost);
    }

    /** Every field of {@code recorded} that is absent or different in {@code read}, by path. */
    private static void collectLost(String path, JsonNode recorded, JsonNode read, List<String> lost) {
        if (recorded == null || recorded.isNull()) {
            return;
        }
        if (read == null || read.isNull() || read.isMissingNode()) {
            lost.add(path + " (missing)");
            return;
        }
        if (recorded.isObject()) {
            for (String field : recorded.propertyNames()) {
                collectLost(path + "." + field, recorded.get(field), read.get(field), lost);
            }
        } else if (recorded.isNumber() && read.isNumber()) {
            if (recorded.decimalValue().compareTo(read.decimalValue()) != 0) {
                lost.add(path + " (" + recorded + " read as " + read + ")");
            }
        } else if (!recorded.equals(read) && !sameInstant(recorded, read)) {
            lost.add(path + " (" + recorded + " read as " + read + ")");
        }
    }

    private static boolean sameInstant(JsonNode a, JsonNode b) {
        try {
            return a.isString() && b.isString()
                    && java.time.Instant.parse(a.asString()).equals(java.time.Instant.parse(b.asString()));
        } catch (java.time.format.DateTimeParseException e) {
            return false;
        }
    }

    /** A row stamped with the current version decodes as that version, not as legacy. */
    @Test
    void readsStampedRowAsItsVersion() throws IOException {
        JsonNode row = JSON.readTree(Files.readString(FIXTURES.resolve("legacy-create-event.json")));
        ((tools.jackson.databind.node.ObjectNode) row).put("schema_version", OrderEventSchemaVersion.CURRENT);

        StoredEvent event = decoder.decodeRow(row);

        assertFalse(event.legacy());
        assertEquals(OrderEventSchemaVersion.CURRENT, event.schemaVersion());
    }

    /** A row from a newer build cannot be read by this one: refused, never half-decoded. */
    @Test
    void refusesRowsFromANewerSchemaVersion() throws IOException {
        JsonNode row = JSON.readTree(Files.readString(FIXTURES.resolve("legacy-create-event.json")));
        ((tools.jackson.databind.node.ObjectNode) row).put("schema_version", OrderEventSchemaVersion.CURRENT + 1);

        assertThrows(IllegalStateException.class, () -> decoder.decodeRow(row));
    }

    /** The constants holder is the single source of the current version. */
    @Test
    void currentSchemaVersionIsOne() {
        assertEquals(1, OrderEventSchemaVersion.CURRENT);
    }
}
