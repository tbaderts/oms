package org.example.oms.api;

import java.util.List;
import java.util.Map;

import org.example.oms.api.metamodel.EntityMetadataDto;
import org.example.oms.service.MetamodelService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * REST controller exposing metamodel information for UI components. Provides entity and field
 * metadata used to dynamically configure blotter tables, filters, and column definitions.
 */
@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/v1/metamodel")
public class MetamodelController {

    private final MetamodelService metamodelService;

    @GetMapping
    public ResponseEntity<Map<String, EntityMetadataDto>> getAllMetadata() {
        log.debug("Request to get all metamodel metadata");
        Map<String, EntityMetadataDto> metadata = metamodelService.getAllMetadata();
        return ResponseEntity.ok(metadata);
    }

    @GetMapping("/{entityName}")
    public ResponseEntity<EntityMetadataDto> getEntityMetadata(
            @PathVariable("entityName") String entityName) {
        log.info("Request to get metamodel metadata for entity: {}", entityName);
        EntityMetadataDto metadata = metamodelService.getEntityMetadata(entityName);
        if (metadata == null) {
            log.warn("Metamodel not found for entity: {}", entityName);
            return ResponseEntity.notFound().build();
        }
        log.info("Returning metamodel for {}: {} fields", entityName, metadata.getFields().size());
        return ResponseEntity.ok(metadata);
    }

    @GetMapping("/entities")
    public ResponseEntity<List<String>> listEntities() {
        log.debug("Request to list all metamodel entities");
        List<String> entities = metamodelService.listEntities();
        return ResponseEntity.ok(entities);
    }
}
