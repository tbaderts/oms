package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;

import org.apache.avro.Schema;
import org.apache.avro.SchemaCompatibility;
import org.apache.avro.SchemaCompatibility.SchemaCompatibilityType;
import org.example.common.model.msg.Execution;
import org.junit.jupiter.api.Test;

/**
 * Guards P-04 for the executions stream. The baseline is the resolved schema of the major version
 * released in SPEC-0039 (decimal(18,8)); replace it only when a new version has actually been released.
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

    /** SPEC-0069: the FIX instrument block is optional in the schema, so old writers stay readable. */
    @Test
    void instrumentFieldsAreOptional() {
        for (String field : new String[] {"symbol", "securityId", "securityIdSource"}) {
            Schema.Field f = Execution.getClassSchema().getField(field);
            assertNotNull(f, field + " is on Execution");
            assertEquals(Schema.Type.UNION, f.schema().getType(), field + " is nullable");
            assertEquals(Schema.Type.NULL, f.schema().getTypes().getFirst().getType(), field + " defaults to null");
            assertTrue(f.hasDefaultValue(), field + " has a default");
        }
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
