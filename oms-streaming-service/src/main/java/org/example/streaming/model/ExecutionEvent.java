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
    /** The order as of this fill (SPEC-0019); the blotter shows it on the fill's row. */
    private OrderDto order;
    private Long sequenceNumber;
    private Instant timestamp;
    /** On the {@code SNAPSHOT_END} marker only: the number of executions matching the filter (SPEC-0057). */
    private Long snapshotTotal;

    /**
     * The marker sent after the last snapshot execution (SPEC-0057); see
     * {@link OrderEvent#snapshotEnd(long)}.
     */
    public static ExecutionEvent snapshotEnd(long matching) {
        return ExecutionEvent.builder()
                .eventType(OrderEvent.SNAPSHOT_END)
                .snapshotTotal(matching)
                .timestamp(Instant.now())
                .build();
    }

    /**
     * Creates an ExecutionEvent from an ExecutionDto.
     */
    public static ExecutionEvent fromExecution(ExecutionDto execution, String eventType) {
        return ExecutionEvent.builder()
                .eventType(eventType)
                .execId(execution.getExecId())
                .orderId(execution.getOrderId())
                .execution(execution)
                .order(execution.getOrder())
                .sequenceNumber(execution.getSequenceNumber())
                .timestamp(Instant.now())
                .build();
    }
}
