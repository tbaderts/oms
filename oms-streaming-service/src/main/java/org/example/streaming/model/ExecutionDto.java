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
 * in the Trade Blotter execution grid: the execution's own fields, without its order's
 * (SPEC-0071).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class ExecutionDto {

    private String execId;
    private String orderId;
    /** The instrument traded, for the blotter's symbol column (SPEC-0069). */
    private String symbol;
    private String securityId;

    private BigDecimal lastQty;
    private BigDecimal lastPx;
    private BigDecimal cumQty;
    private BigDecimal avgPx;
    private BigDecimal leavesQty;

    private String execType;
    private String lastMkt;
    private String lastCapacity;
    /** APPLIED, BUSTED or CORRECTED (SPEC-0044); every live fill on oms_executions is APPLIED. */
    private String status;

    private Instant transactTime;
    private Instant creationDate;

    private Long sequenceNumber;
    private Instant eventTime;

    /** The order's event-log version this fill produced; with execId, the dedup key (SPEC-0019). */
    private Long orderVersion;
}
