package org.example.streaming.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

import java.util.List;

import org.example.streaming.service.MetadataService;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** SPEC-0071 AC-6: the status reports no cache sizes; the service holds no orders or executions. */
class MetadataControllerStatusTest {

    @Test
    void statusHasNoCacheSizes() {
        MetadataController controller = new MetadataController(mock(MetadataService.class));

        JsonNode status = JsonMapper.builder().build().valueToTree(controller.getStatus().block());

        assertEquals(List.of("status"), List.copyOf(status.propertyNames()));
        assertEquals("OK", status.get("status").asString());
    }
}
