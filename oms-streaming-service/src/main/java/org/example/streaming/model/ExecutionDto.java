package org.example.streaming.model;

import java.math.BigDecimal;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Execution data transfer object for streaming to Trade Blotter UI.
 * 
 * <p>This DTO contains execution fill information for display
 * in the Trade Blotter execution grid.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class ExecutionDto {

    private String execId;
    private String orderId;
    private String executionId;
    
    private BigDecimal lastQty;
    private BigDecimal lastPx;
    private BigDecimal cumQty;
    private BigDecimal avgPx;
    private BigDecimal leavesQty;
    
    private String execType;
    private String lastMkt;
    private String lastCapacity;
    
    private Instant transactTime;
    private Instant creationDate;
    
    private Long sequenceNumber;
    private Instant eventTime;
}
