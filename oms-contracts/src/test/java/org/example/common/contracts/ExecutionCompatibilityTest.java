package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.io.InputStream;

import org.apache.avro.Schema;
import org.apache.avro.SchemaCompatibility;
import org.apache.avro.SchemaCompatibility.SchemaCompatibilityType;
import org.example.common.model.msg.Execution;
import org.junit.jupiter.api.Test;

/**
 * Guards P-04 for the executions stream. The baseline is the resolved schema as it stood before
 * SPEC-0019; replace it only when a new version has actually been released.
 *
 * <p>Both directions matter: oms-core may publish the new schema while a consumer still reads with
 * the old one, and the reverse during a rollback.
 */
class ExecutionCompatibilityTest {

    private static final String BASELINE = "/compat/Execution-baseline.json";

    @Test
    void newSchemaReadsBaselineAndBack() throws IOException {
        Schema baseline = loadBaseline();
        assertCompatible(Execution.getClassSchema(), baseline, "backward");
        assertCompatible(baseline, Execution.getClassSchema(), "forward");
    }

    private static void assertCompatible(Schema reader, Schema writer, String direction) {
        SchemaCompatibility.SchemaPairCompatibility result =
                SchemaCompatibility.checkReaderWriterCompatibility(reader, writer);
        assertEquals(
                SchemaCompatibilityType.COMPATIBLE,
                result.getType(),
                () -> "Execution is not " + direction + " compatible: " + result.getDescription());
    }

    private static Schema loadBaseline() throws IOException {
        try (InputStream in = ExecutionCompatibilityTest.class.getResourceAsStream(BASELINE)) {
            return new Schema.Parser().parse(in);
        }
    }
}
