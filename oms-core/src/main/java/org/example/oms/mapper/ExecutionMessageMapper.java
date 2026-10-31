package org.example.oms.mapper;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.springframework.stereotype.Component;

/**
 * Maps the Execution JPA entity to the Avro record published on the executions topic.
 *
 * <p>The message carries the fill itself ({@code lastQty}, {@code lastPx}) and the order's resulting
 * position ({@code cumQty}, {@code leavesQty}), so a consumer can render a fill without having to
 * join against the orders topic.
 *
 * <p>Decimals are declared at scale 4 in the schema, matching the scale the execution pipeline
 * computes quantities at. Avro rescales losslessly and throws rather than round, so a quantity with
 * more precision than the contract allows fails loudly at publish time instead of being silently
 * rounded — the right trade-off for trade quantities.
 */
@Component
public class ExecutionMessageMapper {

    /**
     * @param order the order as of this fill, for its root; null for outbox rows staged before
     *     SPEC-0019, which then publish the execution's own order id as the root
     * @param orderVersion the event-log version the fill produced
     */
    public org.example.common.model.msg.Execution toExecutionMessage(
            Execution execution, Order order, long orderVersion) {
        if (execution == null) {
            return null;
        }

        return org.example.common.model.msg.Execution.newBuilder()
                .setExecId(execution.getExecID())
                .setOrderId(execution.getOrderId())
                .setRootOrderId(order != null ? OrderMessageMapper.rootOrderIdOf(order) : execution.getOrderId())
                .setOrderVersion(orderVersion)
                .setLastQty(execution.getLastQty())
                .setLastPx(execution.getLastPx())
                .setCumQty(execution.getCumQty())
                .setLeavesQty(execution.getLeavesQty())
                .setAvgPx(execution.getAvgPx())
                .setExecType(execution.getExecType())
                .setLastMkt(execution.getLastMkt())
                .setLastCapacity(execution.getLastCapacity())
                .setTransactTime(execution.getTransactTime())
                .build();
    }
}
