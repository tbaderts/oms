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
