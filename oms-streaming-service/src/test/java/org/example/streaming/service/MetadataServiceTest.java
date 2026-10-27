package org.example.streaming.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
