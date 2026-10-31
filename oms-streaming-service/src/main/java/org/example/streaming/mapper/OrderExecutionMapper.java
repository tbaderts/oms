package org.example.streaming.mapper;

import java.time.Instant;

import org.example.common.model.msg.OrderExecution;
import org.example.streaming.model.ExecutionDto;
import org.example.streaming.model.OrderDto;
import org.springframework.stereotype.Component;

/**
 * Maps an OrderExecution record (a fill with the order as of that fill) to the streaming DTOs.
 *
 * <p>The record is self-contained, so the fill and its order come from the same message and cannot
 * disagree. The order carries the fill's orderVersion as its eventId, the same number the orders
 * stream publishes for that change.
 */
@Component
public class OrderExecutionMapper {

    public ExecutionDto toExecutionDto(OrderExecution fill) {
        if (fill == null) {
            return null;
        }

        return ExecutionDto.builder()
                .execId(fill.getExecId())
                .orderId(fill.getOrderId())
                .lastQty(fill.getLastQty())
                .lastPx(fill.getLastPx())
                .cumQty(fill.getCumQty())
                .leavesQty(fill.getLeavesQty())
                .avgPx(fill.getAvgPx())
                .execType(fill.getExecType())
                .lastMkt(fill.getLastMkt())
                .lastCapacity(fill.getLastCapacity())
                .transactTime(fill.getTransactTime())
                .orderVersion(fill.getOrderVersion())
                .sequenceNumber(fill.getOrderVersion())
                .eventTime(Instant.now())
                .order(toOrderDto(fill))
                .build();
    }

    public OrderDto toOrderDto(OrderExecution fill) {
        if (fill == null) {
            return null;
        }

        return OrderDto.builder()
                .orderId(fill.getOrderId())
                .parentOrderId(fill.getParentOrderId())
                .rootOrderId(fill.getRootOrderId())
                .clOrdId(fill.getClOrdId())
                .account(fill.getAccount())
                .symbol(fill.getSymbol())
                .side(fill.getSide() != null ? fill.getSide().name() : null)
                .ordType(fill.getOrdType() != null ? fill.getOrdType().name() : null)
                .state(fill.getState() != null ? fill.getState().name() : null)
                .orderQty(fill.getOrderQty())
                .cumQty(fill.getCumQty())
                .leavesQty(fill.getLeavesQty())
                .price(fill.getPrice())
                .avgPx(fill.getAvgPx())
                .securityId(fill.getSecurityId())
                .exDestination(fill.getExDestination())
                // transactTime is left unset: the record carries the fill's time, not the order's,
                // which stays on the ExecutionDto.
                .eventId(fill.getOrderVersion())
                .sequenceNumber(fill.getOrderVersion())
                .eventTime(Instant.now())
                .build();
    }
}
