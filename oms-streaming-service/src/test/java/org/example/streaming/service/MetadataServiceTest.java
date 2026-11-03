package org.example.streaming.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.example.streaming.model.ObjectMetadata;
import org.junit.jupiter.api.Test;

class MetadataServiceTest {

    @Test
    void orderMetadataListsRejectReason() {
        ObjectMetadata.FieldMetadata field =
                new MetadataService().getOrderMetadata().getFields().stream()
                        .filter(f -> "rejectReason".equals(f.getName()))
                        .findFirst()
                        .orElseThrow(() -> new AssertionError("Order metadata has no rejectReason"));

        assertEquals("String", field.getDataType());
    }

    /** SPEC-0041 AC-7: a fill is named by execId only; executionId was never populated. */
    @Test
    void executionMetadataHasNoExecutionId() {
        List<String> fields =
                new MetadataService().getExecutionMetadata().getFields().stream()
                        .map(ObjectMetadata.FieldMetadata::getName)
                        .toList();

        assertTrue(fields.contains("execId"), fields.toString());
        assertFalse(fields.contains("executionId"), fields.toString());
    }
}
