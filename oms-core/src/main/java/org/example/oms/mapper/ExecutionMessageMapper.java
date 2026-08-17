package org.example.oms.mapper;

import org.example.common.model.Execution;
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

    public org.example.common.model.msg.Execution toExecutionMessage(Execution execution) {
        if (execution == null) {
            return null;
        }

        return org.example.common.model.msg.Execution.newBuilder()
                .setExecId(execution.getExecID())
                .setOrderId(execution.getOrderId())
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
