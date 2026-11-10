package org.example.streaming.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Order event received from Kafka order-events topic.
 * 
 * <p>This event wraps an order with metadata about the event type
 * and sequence information for ordering and deduplication.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class OrderEvent {

    private String eventType;     // CREATE, UPDATE, CANCEL, FILL, SNAPSHOT, etc.
    private String orderId;
    private OrderDto order;
    private Long eventId;         // Database event ID for deduplication
    private Long sequenceNumber;
    private Instant timestamp;
    /** On the {@code SNAPSHOT_END} marker only: the number of orders matching the filter (SPEC-0057). */
    private Long snapshotTotal;

    /** Event type of the marker that ends the snapshot (SPEC-0057). */
    public static final String SNAPSHOT_END = "SNAPSHOT_END";

    /**
     * The marker sent after the last snapshot order: the client loads the snapshot then, and shows
     * how many orders matched although it was sent at most its limit.
     */
    public static OrderEvent snapshotEnd(long matching) {
        return OrderEvent.builder()
                .eventType(SNAPSHOT_END)
                .snapshotTotal(matching)
                .timestamp(Instant.now())
                .build();
    }
    
    /**
     * Creates an OrderEvent from an OrderDto.
     */
    public static OrderEvent fromOrder(OrderDto order, String eventType) {
        return OrderEvent.builder()
                .eventType(eventType)
                .orderId(order.getOrderId())
                .order(order)
                .eventId(order.getEventId())
                .sequenceNumber(order.getSequenceNumber())
                .timestamp(Instant.now())
                .build();
    }
}
