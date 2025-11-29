package org.example.streaming.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Execution event received from Kafka execution-events topic.
 * 
 * <p>This event wraps an execution with metadata about the event type
 * and sequence information for ordering.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class ExecutionEvent {

    private String eventType;     // NEW, CORRECT, BUST, etc.
    private String execId;
    private String orderId;
    private ExecutionDto execution;
    private Long sequenceNumber;
    private Instant timestamp;
    
    /**
     * Creates an ExecutionEvent from an ExecutionDto.
     */
    public static ExecutionEvent fromExecution(ExecutionDto execution, String eventType) {
        return ExecutionEvent.builder()
                .eventType(eventType)
                .execId(execution.getExecId())
                .orderId(execution.getOrderId())
                .execution(execution)
                .sequenceNumber(execution.getSequenceNumber())
                .timestamp(Instant.now())
                .build();
    }
}
