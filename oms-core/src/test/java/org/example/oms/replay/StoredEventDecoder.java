package org.example.oms.replay;

import org.example.common.model.Order;
import org.example.common.model.cmd.Command;
import org.example.oms.model.OrderEventSchemaVersion;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads the stored command and snapshot JSON of an {@code order_events} row under the upcasting
 * rule (SPEC-0024, documented in oms-knowledge-base/oms-framework/oms-state-store.md):
 *
 * <ul>
 *   <li>a row without {@code schema_version} was written before the column existed and is version
 *       1;
 *   <li>a row of an older version is brought to {@link OrderEventSchemaVersion#CURRENT} by the
 *       upcast steps, one per version, applied in order to the JSON before it is decoded. Version 1
 *       is the only version so far, so there is no step yet; the first bump adds one here, with a
 *       golden fixture of the old shape;
 *   <li>a row of a newer version than this build knows is refused: decoding it with an older model
 *       would drop what the newer one added.
 * </ul>
 *
 * <p>The golden-fixture test and the replay harness's reader both decode through this class, so the
 * rule lives in one place.
 */
public final class StoredEventDecoder {

    private final ObjectMapper json;

    public StoredEventDecoder() {
        this(JsonMapper.builder().build());
    }

    public StoredEventDecoder(ObjectMapper json) {
        this.json = json;
    }

    /** The schema version a row is read as: its stored value, or 1 when it has none. */
    public static int effectiveVersion(Integer stored) {
        if (stored == null) {
            return 1;
        }
        if (stored > OrderEventSchemaVersion.CURRENT) {
            throw new IllegalStateException("Event JSON of schema version " + stored
                    + " is newer than this build reads (" + OrderEventSchemaVersion.CURRENT + ")");
        }
        return stored;
    }

    /** Decodes one row from its columns, as read from the database. */
    public StoredEvent decode(
            long id,
            String orderId,
            long version,
            String event,
            String resultingState,
            Integer schemaVersion,
            String transactionJson,
            String snapshotJson) {
        return decode(
                id,
                orderId,
                version,
                event,
                resultingState,
                schemaVersion,
                transactionJson == null ? null : json.readTree(transactionJson),
                snapshotJson == null ? null : json.readTree(snapshotJson));
    }

    /**
     * Decodes one row in the golden-fixture shape: an object keyed by column name, with
     * {@code transaction} and {@code order_snapshot} as nested JSON.
     */
    public StoredEvent decodeRow(JsonNode row) {
        return decode(
                row.path("id").asLong(0),
                text(row, "order_id"),
                row.path("version").asLong(),
                text(row, "event"),
                text(row, "resulting_state"),
                row.hasNonNull("schema_version") ? row.get("schema_version").asInt() : null,
                row.get("transaction"),
                row.get("order_snapshot"));
    }

    private StoredEvent decode(
            long id,
            String orderId,
            long version,
            String event,
            String resultingState,
            Integer schemaVersion,
            JsonNode transaction,
            JsonNode snapshot) {
        int readAs = effectiveVersion(schemaVersion);
        // Upcast steps from readAs to CURRENT go here, in version order. There are none yet.
        Command command = isNull(transaction) ? null : json.treeToValue(transaction, Command.class);
        Order order = isNull(snapshot) ? null : json.treeToValue(snapshot, Order.class);
        return new StoredEvent(id, orderId, version, event, resultingState, readAs, schemaVersion == null, command, order);
    }

    private static boolean isNull(JsonNode node) {
        return node == null || node.isNull() || node.isMissingNode();
    }

    private static String text(JsonNode row, String field) {
        return row.hasNonNull(field) ? row.get(field).asString() : null;
    }
}
