package org.example.oms.service.execution.tasks;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that calculates order quantities based on execution data.
 *
 * <p>Calculations performed:
 *
 * <ul>
 *   <li>cumQty = previous cumQty + execution.lastQty
 *   <li>leavesQty = orderQty - cumQty
 * </ul>
 *
 * <p>The calculated values are stored in the typed context fields for subsequent tasks to use.
 */
@Component
@Slf4j
public class CalculateOrderQuantitiesTask implements Task<OrderTaskContext> {

    private static final int QUANTITY_SCALE = 4;

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        log.debug("Calculating order quantities for context: {}", context.getContextId());

        Order order = context.getOrder();
        Execution execution = context.getExecution();

        BigDecimal previousCumQty =
                order.getCumQty() != null ? order.getCumQty() : BigDecimal.ZERO;
        BigDecimal orderQty = order.getOrderQty();
        BigDecimal lastQty = execution.getLastQty();

        BigDecimal newCumQty = previousCumQty.add(lastQty);

        if (newCumQty.compareTo(orderQty) > 0) {
            return TaskResult.failed(
                    getName(),
                    String.format(
                            "Execution would cause cumQty (%s) to exceed orderQty (%s)",
                            newCumQty, orderQty));
        }

        BigDecimal newLeavesQty = orderQty.subtract(newCumQty);

        context.setCalculatedCumQty(newCumQty.setScale(QUANTITY_SCALE, RoundingMode.HALF_UP));
        context.setCalculatedLeavesQty(newLeavesQty.setScale(QUANTITY_SCALE, RoundingMode.HALF_UP));

        log.info(
                "Quantity calculations completed - orderId={}, previousCumQty={}, lastQty={}, "
                        + "newCumQty={}, newLeavesQty={}",
                order.getOrderId(),
                previousCumQty,
                lastQty,
                newCumQty,
                newLeavesQty);

        return TaskResult.success(getName(), "Order quantities calculated successfully");
    }

    @Override
    public int getOrder() {
        return 200;
    }
}
