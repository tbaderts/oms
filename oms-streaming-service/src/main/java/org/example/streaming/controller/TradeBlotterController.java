package org.example.streaming.controller;

import org.example.streaming.model.ExecutionEvent;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.StreamFilter;
import org.example.streaming.model.StreamRequest;
import org.example.streaming.service.EventStreamProvider;
import org.example.streaming.service.FilterService;
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
 *   <li>{@code blotter.stream} - Combined stream based on StreamRequest
 *   <li>{@code orders.snapshot} - Get current order snapshot
 *   <li>{@code executions.snapshot} - Get current execution snapshot
 * </ul>
 * 
 * <h2>Communication Patterns</h2>
 * <ul>
 *   <li>Request-Stream: For streaming data to UI
 *   <li>Fire-and-Forget: For filter updates
 *   <li>Request-Response: For snapshots
 * </ul>
 * 
 * @see EventStreamProvider
 * @see FilterService
 */
@Controller
@Slf4j
@RequiredArgsConstructor
public class TradeBlotterController {

    private final EventStreamProvider eventStreamProvider;
    private final FilterService filterService;

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
        
        return eventStreamProvider.getExecutionEventStream(true)
                .filter(filterService.createExecutionEventPredicate(filter))
                .doOnSubscribe(sub -> log.debug("Executions stream subscription started"))
                .doOnCancel(() -> log.debug("Executions stream subscription cancelled"))
                .doOnError(error -> log.error("Error in executions stream", error));
    }

    /**
     * Unified stream endpoint based on StreamRequest configuration.
     * 
     * <p>Allows clients to specify stream type (ORDERS, EXECUTIONS, or ALL)
     * along with filter criteria in a single request.
     * 
     * @param request the stream request with type and filter
     * @return Flux of order events (executions included as order updates)
     */
    @MessageMapping("blotter.stream")
    public Flux<OrderEvent> streamBlotter(@Payload StreamRequest request) {
        log.info("Client subscribed to blotter stream: blotterId={}, type={}", 
                request.getBlotterId(), request.getStreamType());
        
        StreamFilter filter = request.getFilter() != null 
                ? request.getFilter() 
                : StreamFilter.withSnapshot();
        
        return switch (request.getStreamType()) {
            case ORDERS -> eventStreamProvider.getOrderEventStream(filter);
            case EXECUTIONS -> eventStreamProvider.getExecutionEventStream(true)
                    .map(this::toOrderEvent)
                    .filter(filterService.createOrderEventPredicate(filter));
            case ALL -> {
                Flux<OrderEvent> orders = eventStreamProvider.getOrderEventStream(filter);
                Flux<OrderEvent> executions = eventStreamProvider.getExecutionEventStream(true)
                        .map(this::toOrderEvent)
                        .filter(filterService.createOrderEventPredicate(filter));
                yield Flux.merge(orders, executions);
            }
            default -> eventStreamProvider.getOrderEventStream(filter);
        };
    }

    /**
     * Gets the current snapshot of all orders.
     * 
     * <p>Request-Response pattern for initial data load.
     * 
     * @param filter optional filter criteria
     * @return Flux of current orders
     */
    @MessageMapping("orders.snapshot")
    public Flux<OrderEvent> getOrderSnapshot(@Payload(required = false) StreamFilter filter) {
        log.info("Client requested orders snapshot");
        
        return eventStreamProvider.getCurrentOrders()
                .filter(filterService.createOrderPredicate(filter))
                .map(order -> OrderEvent.fromOrder(order, "SNAPSHOT"));
    }

    /**
     * Gets the current snapshot of all executions.
     * 
     * @param filter optional filter criteria
     * @return Flux of current executions
     */
    @MessageMapping("executions.snapshot")
    public Flux<ExecutionEvent> getExecutionSnapshot(@Payload(required = false) StreamFilter filter) {
        log.info("Client requested executions snapshot");
        
        return eventStreamProvider.getCurrentExecutions()
                .filter(filterService.createExecutionPredicate(filter))
                .map(exec -> ExecutionEvent.fromExecution(exec, "SNAPSHOT"));
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

    /**
     * Converts an ExecutionEvent to an OrderEvent for unified streaming.
     */
    private OrderEvent toOrderEvent(ExecutionEvent execEvent) {
        return OrderEvent.builder()
                .eventType("EXECUTION_" + execEvent.getEventType())
                .orderId(execEvent.getOrderId())
                .sequenceNumber(execEvent.getSequenceNumber())
                .timestamp(execEvent.getTimestamp())
                .build();
    }
}
