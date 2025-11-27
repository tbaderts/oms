package org.example.oms.api;

import java.util.List;
import java.util.Map;

import org.example.oms.api.dto.metamodel.EntityMetadataDto;
import org.example.oms.service.infra.metamodel.MetamodelService;
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

    /**
     * Get metadata for all available entities.
     *
     * @return Map of entity name to metadata
     */
    @GetMapping
    public ResponseEntity<Map<String, EntityMetadataDto>> getAllMetadata() {
        log.debug("Request to get all metamodel metadata");
        Map<String, EntityMetadataDto> metadata = metamodelService.getAllMetadata();
        return ResponseEntity.ok(metadata);
    }

    /**
     * Get metadata for a specific entity.
     *
     * @param entityName Entity name (e.g., "Order", "Execution")
     * @return Entity metadata or 404 if not found
     */
    @GetMapping("/{entityName}")
    public ResponseEntity<EntityMetadataDto> getEntityMetadata(
            @PathVariable("entityName") String entityName) {
        log.info("Request to get metamodel metadata for entity: {}", entityName);
        try {
            EntityMetadataDto metadata = metamodelService.getEntityMetadata(entityName);
            if (metadata == null) {
                log.warn("Metamodel not found for entity: {}", entityName);
                return ResponseEntity.notFound().build();
            }
            log.info(
                    "Returning metamodel for {}: {} fields",
                    entityName,
                    metadata.getFields().size());
            return ResponseEntity.ok(metadata);
        } catch (Exception e) {
            log.error("Error retrieving metamodel for entity: " + entityName, e);
            throw e;
        }
    }

    /**
     * List all available entity names.
     *
     * @return List of entity names
     */
    @GetMapping("/entities")
    public ResponseEntity<List<String>> listEntities() {
        log.debug("Request to list all metamodel entities");
        List<String> entities = metamodelService.listEntities();
        return ResponseEntity.ok(entities);
    }

    /**
     * Health check endpoint for metamodel service.
     *
     * @return Health status
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        log.debug("Metamodel health check requested");
        Map<String, Object> health =
                Map.of(
                        "status", "UP",
                        "service", "metamodel",
                        "entitiesAvailable", metamodelService.listEntities().size());
        return ResponseEntity.ok(health);
    }
}
