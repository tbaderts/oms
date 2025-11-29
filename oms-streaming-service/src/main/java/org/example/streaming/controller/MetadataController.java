package org.example.streaming.controller;

import java.util.List;

import org.example.streaming.model.ObjectMetadata;
import org.example.streaming.service.EventStreamProvider;
import org.example.streaming.service.MetadataService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import reactor.core.publisher.Mono;

/**
 * REST controller for Trade Blotter metadata and status.
 * 
 * <p>Provides metadata about available domain objects and their fields
 * for building dynamic filter interfaces in the UI.
 * 
 * <p>Endpoints:
 * <ul>
 *   <li>GET /trade-blotter/metadata - All object metadata
 *   <li>GET /trade-blotter/metadata/orders - Order field metadata
 *   <li>GET /trade-blotter/metadata/executions - Execution field metadata
 *   <li>GET /trade-blotter/status - Service status
 * </ul>
 */
@RestController
@RequestMapping("/trade-blotter")
@RequiredArgsConstructor
public class MetadataController {

    private final MetadataService metadataService;
    private final EventStreamProvider eventStreamProvider;

    /**
     * Returns metadata for all domain objects.
     */
    @GetMapping("/metadata")
    public Mono<List<ObjectMetadata>> getAllMetadata() {
        return Mono.just(metadataService.getAllMetadata());
    }

    /**
     * Returns metadata for Order objects.
     */
    @GetMapping("/metadata/orders")
    public Mono<ObjectMetadata> getOrderMetadata() {
        return Mono.just(metadataService.getOrderMetadata());
    }

    /**
     * Returns metadata for Execution objects.
     */
    @GetMapping("/metadata/executions")
    public Mono<ObjectMetadata> getExecutionMetadata() {
        return Mono.just(metadataService.getExecutionMetadata());
    }

    /**
     * Returns current service status including cache sizes.
     */
    @GetMapping("/status")
    public Mono<ServiceStatus> getStatus() {
        return Mono.just(ServiceStatus.builder()
                .status("OK")
                .ordersInCache(eventStreamProvider.getOrderCacheSize())
                .executionsInCache(eventStreamProvider.getExecutionCacheSize())
                .build());
    }

    @lombok.Data
    @lombok.Builder
    @lombok.AllArgsConstructor
    public static class ServiceStatus {
        private String status;
        private int ordersInCache;
        private int executionsInCache;
    }
}
