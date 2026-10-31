package org.example.oms.mapper;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.msg.OrderExecution;
import org.springframework.stereotype.Component;

/**
 * Maps a fill and the order it changed to the Avro record published on the order-executions topic.
 *
 * <p>Both come from the same outbox row, staged in the fill's transaction, so the order fields are
 * exactly the order as of this fill. A consumer needs no lookup and no join with the orders topic.
 *
 * <p>{@code tradeDate} is the UTC date of the fill's {@code transactTime}. A fill without one falls
 * back to the row's staging time, never to the publish time, so a republished record keeps its date.
 */
@Component
public class OrderExecutionMessageMapper {

    public OrderExecution toOrderExecutionMessage(
            Execution execution, Order order, long orderVersion, Instant stagedAt) {
        if (execution == null || order == null) {
            return null;
        }

        Instant tradeTime = execution.getTransactTime() != null ? execution.getTransactTime() : stagedAt;

        return OrderExecution.newBuilder()
                .setExecId(execution.getExecID())
                .setLastQty(execution.getLastQty())
                .setLastPx(execution.getLastPx())
                .setExecType(execution.getExecType())
                .setLastCapacity(execution.getLastCapacity())
                .setLastMkt(execution.getLastMkt())
                .setTransactTime(execution.getTransactTime())
                .setOrderId(order.getOrderId())
                .setRootOrderId(OrderMessageMapper.rootOrderIdOf(order))
                .setParentOrderId(order.getParentOrderId())
                .setLeg(order.getLeg() != null ? order.getLeg().name() : null)
                .setClOrdId(order.getClOrdId())
                .setSessionId(order.getSessionId())
                .setAccount(order.getAccount())
                .setSide(OrderMessageMapper.mapSide(order.getSide()))
                .setSymbol(order.getSymbol())
                .setSecurityId(order.getSecurityId())
                .setOrdType(OrderMessageMapper.mapOrdType(order.getOrdType()))
                .setPrice(order.getPrice())
                .setOrderQty(order.getOrderQty())
                .setSettlCurrency(order.getSettlCurrency())
                .setExDestination(order.getExDestination())
                .setCumQty(order.getCumQty())
                .setLeavesQty(order.getLeavesQty())
                .setAvgPx(execution.getAvgPx())
                .setState(OrderMessageMapper.mapState(order.getState()))
                .setOrderVersion(orderVersion)
                .setTradeDate(tradeTime != null ? LocalDate.ofInstant(tradeTime, ZoneOffset.UTC) : null)
                .build();
    }
}
