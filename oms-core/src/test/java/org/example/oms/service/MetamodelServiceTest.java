package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.example.oms.api.metamodel.EntityMetadataDto;
import org.example.oms.api.metamodel.FieldMetadataDto;
import org.junit.jupiter.api.Test;

/** The oms-ui blotters build their column selector from this metamodel. */
class MetamodelServiceTest {

    /**
     * The executions blotter's default columns; the streaming ExecutionDto must carry each of them
     * too (SPEC-0041 AC-7, asserted in oms-streaming-service).
     */
    static final List<String> EXECUTION_DEFAULT_COLUMNS =
            List.of(
                    "execId",
                    "orderId",
                    "execType",
                    "lastQty",
                    "lastPx",
                    "cumQty",
                    "leavesQty",
                    "avgPx",
                    "transactTime");

    @Test
    void orderMetamodelIncludesRejectReason() {
        MetamodelService service = new MetamodelService();
        service.initialize();

        FieldMetadataDto field =
                service.getEntityMetadata("Order").getFields().stream()
                        .filter(f -> "rejectReason".equals(f.getName()))
                        .findFirst()
                        .orElseThrow(() -> new AssertionError("Order metamodel has no rejectReason"));

        assertEquals("Reject Reason", field.getDisplayName());
        assertEquals("string", field.getType().toLowerCase());
    }

    /** SPEC-0041 AC-1: a fill is identified by execId, and every default column has data. */
    @Test
    void executionMetamodelUsesExecIdAndResolvableDefaults() {
        MetamodelService service = new MetamodelService();
        service.initialize();

        EntityMetadataDto execution = service.getEntityMetadata("Execution");
        Set<String> fields =
                execution.getFields().stream()
                        .map(FieldMetadataDto::getName)
                        .collect(Collectors.toSet());

        assertEquals("execId", execution.getPrimaryKey());
        assertFalse(fields.contains("execID"), "execID must not be a field");
        assertFalse(fields.contains("executionId"), "executionId must not be a field");
        assertTrue(
                fields.containsAll(execution.getDefaultColumns()),
                () -> "default columns not in fields: " + execution.getDefaultColumns());
        assertEquals(EXECUTION_DEFAULT_COLUMNS, execution.getDefaultColumns());
        assertTrue(fields.contains("id"), "the surrogate id stays selectable, as on orders");
    }

    /**
     * SPEC-0058 AC-3: enum labels are words, as a badge shows them. They used to go through the
     * camelCase field-name splitter, which put a space before every capital: BUY became "B U Y".
     */
    @Test
    void enumLabelsAreWords() {
        MetamodelService service = new MetamodelService();
        service.initialize();
        EntityMetadataDto order = service.getEntityMetadata("Order");

        assertEquals("Buy", label(order, "side", "BUY"));
        assertEquals("Sell Short", label(order, "side", "SELL_SHORT"));
        assertEquals("Market On Close", label(order, "ordType", "MARKET_ON_CLOSE"));
        assertEquals("Good Till Cancel", label(order, "timeInForce", "GOOD_TILL_CANCEL"));
        assertEquals("CXL", label(order, "state", "CXL"), "a domain code stays as it is");
        assertEquals("ETF", label(order, "securityType", "ETF"));
        assertEquals("OK To Cross", label(order, "execInst", "OK_TO_CROSS"));
        assertEquals("Order Qty", field(order, "orderQty").getDisplayName(), "field names are unchanged");
    }

    private static FieldMetadataDto field(EntityMetadataDto entity, String name) {
        return entity.getFields().stream()
                .filter(f -> name.equals(f.getName()))
                .findFirst()
                .orElseThrow(() -> new AssertionError(entity.getName() + " has no " + name));
    }

    private static String label(EntityMetadataDto entity, String fieldName, String value) {
        return field(entity, fieldName).getEnumValues().stream()
                .filter(v -> value.equals(v.getValue()))
                .findFirst()
                .orElseThrow(() -> new AssertionError(fieldName + " has no enum value " + value))
                .getLabel();
    }
}
