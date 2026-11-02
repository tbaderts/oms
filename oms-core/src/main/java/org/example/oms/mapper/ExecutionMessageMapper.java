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
 * <p>Decimals are declared as decimal(18,8) in the schema, the precision of every price and
 * quantity in the OMS (SPEC-0039), which the API already enforces on the way in. Avro rescales
 * losslessly and throws rather than round, so a value with more precision fails loudly instead of
 * being silently rounded — the right trade-off for trade quantities.
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
