package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.io.IOException;
import java.io.InputStream;

import org.apache.avro.Schema;
import org.apache.avro.SchemaCompatibility;
import org.apache.avro.SchemaCompatibility.SchemaCompatibilityType;
import org.example.common.model.msg.OrderMessage;
import org.junit.jupiter.api.Test;

/**
 * Guards P-04 for the order stream. The baseline is the resolved schema as it stood before
 * SPEC-0003; replace it only when a new version has actually been released.
 *
 * <p>Both directions matter here: oms-core may publish the new schema while oms-streaming-service
 * or other consumers still read with the old one, and the reverse during a rollback.
 */
class OrderMessageCompatibilityTest {

    private static final String BASELINE = "/compat/OrderMessage-baseline.json";

    @Test
    void newSchemaReadsBaselineData() throws IOException {
        assertCompatible(OrderMessage.getClassSchema(), loadBaseline(), "backward");
    }

    @Test
    void baselineReadsNewData() throws IOException {
        assertCompatible(loadBaseline(), OrderMessage.getClassSchema(), "forward");
    }

    @Test
    void orderMessageCarriesRejectReason() {
        Schema.Field field = OrderMessage.getClassSchema().getField("rejectReason");
        assertNotNull(field, "OrderMessage must carry rejectReason (SPEC-0003)");
        assertEquals(Schema.Type.UNION, field.schema().getType());
    }

    private static void assertCompatible(Schema reader, Schema writer, String direction) {
        SchemaCompatibility.SchemaPairCompatibility result =
                SchemaCompatibility.checkReaderWriterCompatibility(reader, writer);
        assertEquals(
                SchemaCompatibilityType.COMPATIBLE,
                result.getType(),
                () -> "OrderMessage is not " + direction + " compatible: " + result.getDescription());
    }

    private static Schema loadBaseline() throws IOException {
        try (InputStream in = OrderMessageCompatibilityTest.class.getResourceAsStream(BASELINE)) {
            return new Schema.Parser().parse(in);
        }
    }
}
