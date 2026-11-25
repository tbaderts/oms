package org.example.streaming.controller;

import org.example.streaming.model.ExecutionEvent;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.StreamFilter;
import org.example.streaming.service.EventStreamProvider;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * RSocket controller for Trade Blotter real-time streaming.
 * 
 * <p>Provides bidirectional streaming of order and execution events
 * to the Trade Blotter UI. Supports filtering and backpressure.
 * 
 * <h2>Endpoints</h2>
 * <ul>
 *   <li>{@code orders.stream} - Stream order events with optional filter
 *   <li>{@code executions.stream} - Stream execution events with optional filter
 *   <li>{@code health} - Liveness
 * </ul>
 *
 * <p>Each stream's snapshot is read from oms-core when it is requested; the service holds no
 * orders or executions (SPEC-0071), so {@code blotter.stream}, {@code orders.snapshot} and
 * {@code executions.snapshot}, which served the former cache, are gone.
 *
 * @see EventStreamProvider
 */
@Controller
@Slf4j
@RequiredArgsConstructor
public class TradeBlotterController {

    private final EventStreamProvider eventStreamProvider;

    /**
     * Streams order events to the client.
     * 
     * <p>Request-Stream pattern: Client requests, server streams data.
     * 
     * <p>When a filter is provided, it is applied to:
     * <ol>
     *   <li>REST API query to fetch initial snapshot from OMS Core</li>
     *   <li>Real-time Kafka stream filtering</li>
     * </ol>
     * 
     * <p>Deduplication is performed using eventId when merging snapshot with live stream.
     * 
     * @param filter optional filter criteria matching Query API format
     * @return Flux of order events
     */
    @MessageMapping("orders.stream")
    public Flux<OrderEvent> streamOrders(@Payload(required = false) StreamFilter filter) {
        log.info("Client subscribed to orders stream with filter: {}, isEmpty: {}, includeSnapshot: {}", 
                filter, 
                filter != null ? filter.isEmpty() : "null",
                filter != null ? filter.isIncludeSnapshot() : "null");
        
        // Use filter with snapshot by default if none provided
        StreamFilter effectiveFilter = filter != null 
                ? filter 
                : StreamFilter.withSnapshot();
        
        log.info("Using effective filter: {}, isEmpty: {}, includeSnapshot: {}", 
                effectiveFilter, effectiveFilter.isEmpty(), effectiveFilter.isIncludeSnapshot());
        
        return eventStreamProvider.getOrderEventStream(effectiveFilter)
                .doOnSubscribe(sub -> log.debug("Orders stream subscription started"))
                .doOnCancel(() -> log.debug("Orders stream subscription cancelled"))
                .doOnError(error -> log.error("Error in orders stream", error));
    }

    /**
     * Streams execution events to the client.
     * 
     * @param filter optional filter criteria
     * @return Flux of execution events
     */
    @MessageMapping("executions.stream")
    public Flux<ExecutionEvent> streamExecutions(@Payload(required = false) StreamFilter filter) {
        log.info("Client subscribed to executions stream with filter: {}", filter);

        // As for orders: a snapshot unless the client asks for none, filtered inside the provider so
        // that the SNAPSHOT_END marker is not dropped (SPEC-0057).
        StreamFilter effectiveFilter = filter != null ? filter : StreamFilter.withSnapshot();
        return eventStreamProvider.getExecutionEventStream(effectiveFilter)
                .doOnSubscribe(sub -> log.debug("Executions stream subscription started"))
                .doOnCancel(() -> log.debug("Executions stream subscription cancelled"))
                .doOnError(error -> log.error("Error in executions stream", error));
    }

    /**
     * Health check endpoint.
     * 
     * @return status message
     */
    @MessageMapping("health")
    public Mono<String> health() {
        return Mono.just("OK");
    }
}
