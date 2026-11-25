package org.example.streaming.mapper;

import java.time.Instant;
import org.example.common.model.msg.Execution;
import org.example.streaming.model.ExecutionDto;
import org.springframework.stereotype.Component;

/**
 * Maps an Execution record from {@code oms_executions} — the fill as the venue reported it, with its
 * instrument (SPEC-0069) — to the streaming DTO (SPEC-0071). No order fields: execution rows show the
 * execution's own fields. {@code orderVersion} is the order event the fill produced; it orders a
 * fill's versions and is what live events are deduplicated against per subscription.
 */
@Component
public class ExecutionMessageMapper {

    /**
     * The fill's status as the execution search reports it (SPEC-0044), so a status filter treats
     * live fills like stored ones: FIX ExecType H (trade cancel) is a bust, G (trade correct) a
     * correction, anything else an applied fill.
     */
    static String statusOf(String execType) {
        return switch (execType == null ? "" : execType) {
            case "H" -> "BUSTED";
            case "G" -> "CORRECTED";
            default -> "APPLIED";
        };
    }

    public ExecutionDto toExecutionDto(Execution fill) {
        if (fill == null) {
            return null;
        }
        return ExecutionDto.builder()
                .execId(fill.getExecId())
                .orderId(fill.getOrderId())
                .symbol(fill.getSymbol())
                .securityId(fill.getSecurityId())
                .lastQty(fill.getLastQty())
                .lastPx(fill.getLastPx())
                .cumQty(fill.getCumQty())
                .leavesQty(fill.getLeavesQty())
                .avgPx(fill.getAvgPx())
                .execType(fill.getExecType())
                .lastMkt(fill.getLastMkt())
                .lastCapacity(fill.getLastCapacity())
                .status(statusOf(fill.getExecType()))
                .transactTime(fill.getTransactTime())
                .orderVersion(fill.getOrderVersion())
                .sequenceNumber(fill.getOrderVersion())
                .eventTime(Instant.now())
                .build();
    }
}
