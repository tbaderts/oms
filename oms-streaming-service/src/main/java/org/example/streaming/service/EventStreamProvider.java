package org.example.streaming.service;

import org.example.streaming.model.ExecutionEvent;
import org.example.streaming.model.ExecutionDto;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.OrderDto;
import org.example.streaming.model.StreamFilter;

import reactor.core.publisher.Flux;

/**
 * Interface for event streaming services.
 * 
 * <p>Allows switching between Kafka-based and mock implementations.
 */
public interface EventStreamProvider {

    /**
     * Returns a stream of order events with optional filtering.
     * 
     * <p>When filter.includeSnapshot is true, fetches filtered snapshot from
     * OMS Core REST API and merges with real-time filtered Kafka stream.
     * Uses eventId for deduplication when merging snapshot with live stream.
     * 
     * @param filter the stream filter (null for unfiltered stream without snapshot)
     * @return Flux of order events
     */
    Flux<OrderEvent> getOrderEventStream(StreamFilter filter);

    /**
     * Returns a stream of order events (legacy method).
     * 
     * @param includeSnapshot whether to include initial snapshot
     * @return Flux of order events
     */
    default Flux<OrderEvent> getOrderEventStream(boolean includeSnapshot) {
        StreamFilter filter = includeSnapshot ? StreamFilter.withSnapshot() : null;
        return getOrderEventStream(filter);
    }

    /**
     * Returns a stream of execution events.
     * 
     * @param includeSnapshot whether to include initial snapshot
     * @return Flux of execution events
     */
    Flux<ExecutionEvent> getExecutionEventStream(boolean includeSnapshot);

    /**
     * Returns current orders from cache.
     */
    Flux<OrderDto> getCurrentOrders();

    /**
     * Returns current executions from cache.
     */
    Flux<ExecutionDto> getCurrentExecutions();

    /**
     * Returns the number of cached orders.
     */
    int getOrderCacheSize();

    /**
     * Returns the number of cached executions.
     */
    int getExecutionCacheSize();
}
