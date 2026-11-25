package org.example.oms.admin;

import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAccessor;
import java.util.Collection;
import java.util.HexFormat;
import java.util.Map;

import org.apache.avro.Conversions;
import org.apache.avro.LogicalType;
import org.apache.avro.LogicalTypes;
import org.apache.avro.Schema;
import org.apache.avro.generic.GenericEnumSymbol;
import org.apache.avro.generic.GenericFixed;
import org.apache.avro.generic.IndexedRecord;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * An Avro record as JSON an operator can read (SPEC-0075): decimals as numbers, timestamps and dates
 * as ISO-8601 text, enums by name, bytes as hex.
 *
 * <p>Works on specific records (whose logical values are already {@link BigDecimal}, {@link Instant}
 * and so on) and on generic records read through the schema registry (whose logical values are still
 * raw bytes, longs and ints, decoded here from the schema). Avro's own {@code toString()} is not used:
 * it writes timestamps and dates unquoted, which is not JSON.
 */
public final class AvroJson {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
    private static final Conversions.DecimalConversion DECIMALS = new Conversions.DecimalConversion();

    private AvroJson() {}

    /** The record as a JSON object. */
    public static JsonNode toJson(IndexedRecord record) {
        return value(record, record.getSchema());
    }

    private static JsonNode value(Object value, Schema schema) {
        if (value == null) {
            return NODES.nullNode();
        }
        Schema resolved = resolve(schema, value);
        return switch (value) {
            case IndexedRecord record -> record(record);
            case BigDecimal decimal -> NODES.numberNode(decimal);
            case Instant instant -> NODES.stringNode(instant.toString());
            case TemporalAccessor temporal -> NODES.stringNode(temporal.toString());
            case CharSequence text -> NODES.stringNode(text.toString());
            case Boolean bool -> NODES.booleanNode(bool);
            case Integer number -> intValue(number, resolved);
            case Long number -> longValue(number, resolved);
            case Float number -> NODES.numberNode(number);
            case Double number -> NODES.numberNode(number);
            case ByteBuffer bytes -> bytesValue(bytes, resolved);
            case GenericFixed fixed -> fixedValue(fixed, resolved);
            case GenericEnumSymbol<?> symbol -> NODES.stringNode(symbol.toString());
            case Enum<?> symbol -> NODES.stringNode(symbol.name());
            case Collection<?> items -> array(items, resolved);
            case Map<?, ?> entries -> map(entries, resolved);
            default -> NODES.stringNode(value.toString());
        };
    }

    private static ObjectNode record(IndexedRecord record) {
        ObjectNode node = NODES.objectNode();
        for (Schema.Field field : record.getSchema().getFields()) {
            node.set(field.name(), value(record.get(field.pos()), field.schema()));
        }
        return node;
    }

    private static ArrayNode array(Collection<?> items, Schema schema) {
        Schema element = schema != null && schema.getType() == Schema.Type.ARRAY ? schema.getElementType() : null;
        ArrayNode node = NODES.arrayNode();
        items.forEach(item -> node.add(value(item, element)));
        return node;
    }

    private static ObjectNode map(Map<?, ?> entries, Schema schema) {
        Schema values = schema != null && schema.getType() == Schema.Type.MAP ? schema.getValueType() : null;
        ObjectNode node = NODES.objectNode();
        entries.forEach((key, item) -> node.set(String.valueOf(key), value(item, values)));
        return node;
    }

    private static JsonNode intValue(Integer number, Schema schema) {
        LogicalType logical = schema == null ? null : schema.getLogicalType();
        if (logical instanceof LogicalTypes.Date) {
            return NODES.stringNode(LocalDate.ofEpochDay(number).toString());
        }
        if (logical instanceof LogicalTypes.TimeMillis) {
            return NODES.stringNode(LocalTime.ofNanoOfDay(number * 1_000_000L).toString());
        }
        return NODES.numberNode(number);
    }

    private static JsonNode longValue(Long number, Schema schema) {
        LogicalType logical = schema == null ? null : schema.getLogicalType();
        if (logical instanceof LogicalTypes.TimestampMillis) {
            return NODES.stringNode(Instant.ofEpochMilli(number).toString());
        }
        if (logical instanceof LogicalTypes.TimestampMicros) {
            return NODES.stringNode(Instant.EPOCH.plus(number, ChronoUnit.MICROS).toString());
        }
        if (logical instanceof LogicalTypes.TimeMicros) {
            return NODES.stringNode(LocalTime.ofNanoOfDay(number * 1_000L).toString());
        }
        return NODES.numberNode(number);
    }

    private static JsonNode bytesValue(ByteBuffer bytes, Schema schema) {
        if (schema != null && schema.getLogicalType() instanceof LogicalTypes.Decimal decimal) {
            return NODES.numberNode(DECIMALS.fromBytes(bytes.duplicate(), schema, decimal));
        }
        ByteBuffer copy = bytes.duplicate();
        byte[] raw = new byte[copy.remaining()];
        copy.get(raw);
        return NODES.stringNode(HexFormat.of().formatHex(raw));
    }

    private static JsonNode fixedValue(GenericFixed fixed, Schema schema) {
        if (schema != null && schema.getLogicalType() instanceof LogicalTypes.Decimal decimal) {
            return NODES.numberNode(DECIMALS.fromFixed(fixed, schema, decimal));
        }
        return NODES.stringNode(HexFormat.of().formatHex(fixed.bytes()));
    }

    /**
     * The branch of a union that holds the value, for the raw values whose meaning depends on the
     * schema (logical types on bytes, fixed, int and long); otherwise the schema as given.
     */
    private static Schema resolve(Schema schema, Object value) {
        if (schema == null || schema.getType() != Schema.Type.UNION) {
            return schema;
        }
        Schema.Type wanted = switch (value) {
            case ByteBuffer ignored -> Schema.Type.BYTES;
            case GenericFixed ignored -> Schema.Type.FIXED;
            case Integer ignored -> Schema.Type.INT;
            case Long ignored -> Schema.Type.LONG;
            case Collection<?> ignored -> Schema.Type.ARRAY;
            case Map<?, ?> ignored -> Schema.Type.MAP;
            default -> null;
        };
        if (wanted == null) {
            return null;
        }
        return schema.getTypes().stream().filter(branch -> branch.getType() == wanted).findFirst().orElse(null);
    }
}
