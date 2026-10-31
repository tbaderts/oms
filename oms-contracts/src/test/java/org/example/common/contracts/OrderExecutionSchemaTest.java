package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.apache.avro.JsonProperties;
import org.apache.avro.Schema;
import org.junit.jupiter.api.Test;

/**
 * SPEC-0019 AC-1: the OrderExecution record carries the fill, the order context, orderVersion and
 * tradeDate, and Execution gains rootOrderId and orderVersion. Every field is optional with a null
 * default, so a reader with an older schema and a writer with a newer one stay compatible (P-04).
 *
 * <p>Reads the schemas from the jar's {@code META-INF/oms-contracts/avro} copy rather than the
 * generated classes, so a missing record fails here with a message instead of a compile error.
 */
class OrderExecutionSchemaTest {

    private static final List<String> ORDER_EXECUTION_FIELDS = List.of(
            "execId", "lastQty", "lastPx", "execType", "lastCapacity", "lastMkt", "transactTime",
            "orderId", "rootOrderId", "parentOrderId", "leg", "clOrdId", "sessionId", "account",
            "side", "symbol", "securityId", "ordType", "price", "orderQty", "settlCurrency",
            "exDestination", "cumQty", "leavesQty", "avgPx", "state", "orderVersion", "tradeDate");

    @Test
    void hasEveryContextFieldNullableWithNullDefault() throws IOException {
        Schema orderExecution = parse("OrderExecution");
        for (String name : ORDER_EXECUTION_FIELDS) {
            assertOptional(orderExecution, name);
        }
        assertEquals(
                "date",
                nonNullBranch(orderExecution.getField("tradeDate")).getLogicalType().getName(),
                "tradeDate is an Avro date");

        Schema execution = parse("Execution");
        assertOptional(execution, "rootOrderId");
        assertOptional(execution, "orderVersion");
    }

    private static void assertOptional(Schema record, String name) {
        Schema.Field field = record.getField(name);
        assertNotNull(field, record.getName() + " must have field " + name);
        assertEquals(Schema.Type.UNION, field.schema().getType(), name + " must be a union with null");
        assertEquals(Schema.Type.NULL, field.schema().getTypes().get(0).getType(), name + " must list null first");
        assertTrue(field.hasDefaultValue(), name + " must have a default");
        assertEquals(JsonProperties.NULL_VALUE, field.defaultVal(), name + " must default to null");
    }

    private static Schema nonNullBranch(Schema.Field field) {
        return field.schema().getTypes().get(1);
    }

    /** Parses the record together with the named types it references (Side, OrdType, State). */
    private static Schema parse(String record) throws IOException {
        Schema.Parser parser = new Schema.Parser();
        for (String named : List.of("Side", "OrdType", "State")) {
            parser.parse(resource(named));
        }
        return parser.parse(resource(record));
    }

    private static InputStream resource(String name) throws IOException {
        InputStream in = OrderExecutionSchemaTest.class.getResourceAsStream(
                "/META-INF/oms-contracts/avro/" + name + ".avsc");
        assertNotNull(in, name + ".avsc must exist in oms-contracts");
        return in;
    }
}
