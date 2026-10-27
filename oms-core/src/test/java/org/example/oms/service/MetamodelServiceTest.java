package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.example.oms.api.metamodel.FieldMetadataDto;
import org.junit.jupiter.api.Test;

/** The oms-ui blotters build their column selector from this metamodel. */
class MetamodelServiceTest {

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
}
