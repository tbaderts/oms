package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.avro.LogicalTypes;
import org.apache.avro.Schema;
import org.example.common.model.msg.CommandHeader;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.Order;
import org.example.common.model.msg.OrderCreateCmd;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Quote;
import org.example.common.model.msg.QuoteCreateCmd;
import org.example.common.model.msg.QuoteRequest;
import org.example.common.model.msg.QuoteRequestCreateCmd;
import org.junit.jupiter.api.Test;

import jakarta.validation.constraints.Digits;

/**
 * SPEC-0039: every price and quantity has one precision, decimal(18,8) (10 integer and 8 decimal
 * digits), in every Avro record and every API model. Nothing is carried as a binary double, and a
 * more precise value cannot be serialised.
 */
class DecimalPrecisionContractTest {

    private static final List<Schema> RECORDS = List.of(
            OrderCreateCmd.getClassSchema(), QuoteCreateCmd.getClassSchema(), QuoteRequestCreateCmd.getClassSchema(),
            OrderMessage.getClassSchema(), Execution.getClassSchema(),
            OrderExecution.getClassSchema(), Quote.getClassSchema(), QuoteRequest.getClassSchema());

    /** The price and quantity fields each record must carry as decimals. */
    private static final Map<String, List<String>> PRICES_AND_QUANTITIES = Map.of(
            "Order", List.of("orderQty", "cashOrderQty", "strikePrice", "price", "stopPx"),
            "OrderMessage", List.of("orderQty", "cashOrderQty", "strikePrice", "price", "stopPx", "cumQty", "leavesQty"),
            "Execution", List.of("lastQty", "lastPx", "cumQty", "leavesQty", "avgPx"),
            "OrderExecution", List.of("lastQty", "lastPx", "price", "orderQty", "cumQty", "leavesQty", "avgPx"),
            "Quote", List.of("price"),
            "QuoteRequest", List.of("quantity"));

    @Test
    void everyAvroDecimalIs18By8AndNoDoubleRemains() {
        List<String> problems = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Schema record : RECORDS) {
            walk(record, record.getName(), problems, seen);
        }
        assertEquals(List.of(), problems);

        for (Map.Entry<String, List<String>> expected : PRICES_AND_QUANTITIES.entrySet()) {
            Schema record = findRecord(expected.getKey());
            for (String name : expected.getValue()) {
                Schema.Field field = record.getField(name);
                assertNotNull(field, expected.getKey() + "." + name);
                assertTrue(LogicalTypes.decimal(18, 8).equals(nonNull(field.schema()).getLogicalType()),
                        expected.getKey() + "." + name + " must be decimal(18,8)");
            }
        }
    }

    @Test
    void aNineDecimalValueCannotBeSerialised() {
        Order order = Order.newBuilder().setPrice(new BigDecimal("170.123456789")).build();
        CommandHeader header = CommandHeader.newBuilder()
                .setCommandId("cmd-1")
                .setSentAt(Instant.now())
                .setProducer("test")
                .build();
        OrderCreateCmd command = new OrderCreateCmd(header, order);

        assertThrows(org.apache.avro.AvroTypeException.class, () -> AvroBytes.encode(command));
    }

    @Test
    void everyPriceAndQuantityInTheApiModelsIsBoundedTo10By8() throws ClassNotFoundException {
        List<String> problems = new ArrayList<>();
        for (String model : List.of(
                "org.example.common.model.cmd.Order",
                "org.example.common.model.cmd.Execution",
                "org.example.common.model.query.OrderDto",
                "org.example.common.model.query.ExecutionViewDto")) {
            for (Field field : Class.forName(model).getDeclaredFields()) {
                if (!BigDecimal.class.equals(field.getType())) {
                    continue;
                }
                Digits digits = field.getAnnotation(Digits.class);
                if (digits == null || digits.integer() != 10 || digits.fraction() != 8) {
                    problems.add(model + "." + field.getName());
                }
            }
        }
        assertEquals(List.of(), problems, "fields without @Digits(integer = 10, fraction = 8)");
    }

    private static void walk(Schema schema, String path, List<String> problems, Set<String> seen) {
        switch (schema.getType()) {
            case RECORD -> {
                if (!seen.add(schema.getFullName())) {
                    return;
                }
                for (Schema.Field field : schema.getFields()) {
                    walk(field.schema(), schema.getName() + "." + field.name(), problems, seen);
                }
            }
            case UNION -> schema.getTypes().forEach(branch -> walk(branch, path, problems, seen));
            case ARRAY -> walk(schema.getElementType(), path, problems, seen);
            case MAP -> walk(schema.getValueType(), path, problems, seen);
            case DOUBLE, FLOAT -> problems.add(path + " is " + schema.getType());
            case BYTES, FIXED -> {
                if (schema.getLogicalType() instanceof LogicalTypes.Decimal decimal
                        && (decimal.getPrecision() != 18 || decimal.getScale() != 8)) {
                    problems.add(path + " is decimal(" + decimal.getPrecision() + "," + decimal.getScale() + ")");
                }
            }
            default -> { }
        }
    }

    private static Schema findRecord(String name) {
        List<Schema> found = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Schema record : RECORDS) {
            collect(record, name, found, seen);
        }
        assertEquals(1, found.size(), "record " + name);
        return found.getFirst();
    }

    private static void collect(Schema schema, String name, List<Schema> found, Set<String> seen) {
        switch (schema.getType()) {
            case RECORD -> {
                if (!seen.add(schema.getFullName())) {
                    return;
                }
                if (schema.getName().equals(name)) {
                    found.add(schema);
                }
                schema.getFields().forEach(f -> collect(f.schema(), name, found, seen));
            }
            case UNION -> schema.getTypes().forEach(branch -> collect(branch, name, found, seen));
            case ARRAY -> collect(schema.getElementType(), name, found, seen);
            case MAP -> collect(schema.getValueType(), name, found, seen);
            default -> { }
        }
    }

    private static Schema nonNull(Schema schema) {
        return schema.getType() == Schema.Type.UNION
                ? schema.getTypes().stream().filter(s -> s.getType() != Schema.Type.NULL).findFirst().orElseThrow()
                : schema;
    }

    /** Binary encoding through the record's own class, so its decimal conversions apply. */
    static final class AvroBytes {
        static byte[] encode(org.apache.avro.specific.SpecificRecord record) throws java.io.IOException {
            var out = new java.io.ByteArrayOutputStream();
            @SuppressWarnings("unchecked")
            var writer = new org.apache.avro.specific.SpecificDatumWriter<org.apache.avro.specific.SpecificRecord>(
                    (Class<org.apache.avro.specific.SpecificRecord>) record.getClass());
            var encoder = org.apache.avro.io.EncoderFactory.get().binaryEncoder(out, null);
            writer.write(record, encoder);
            encoder.flush();
            return out.toByteArray();
        }
    }
}
