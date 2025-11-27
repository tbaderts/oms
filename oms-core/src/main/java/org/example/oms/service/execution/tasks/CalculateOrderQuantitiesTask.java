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
 * <p>Note: avgPx is calculated and stored on the Execution entity, not the Order.
 * 
 * <p>The calculated values are stored in the context for subsequent tasks to use.
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

        // Get current values
        BigDecimal previousCumQty =
                order.getCumQty() != null ? order.getCumQty() : BigDecimal.ZERO;
        BigDecimal orderQty = order.getOrderQty();

        // Get execution values
        BigDecimal lastQty = execution.getLastQty();

        // Calculate new cumQty
        BigDecimal newCumQty = previousCumQty.add(lastQty);

        // Validate cumQty doesn't exceed orderQty
        if (newCumQty.compareTo(orderQty) > 0) {
            return TaskResult.failed(
                    getName(),
                    String.format(
                            "Execution would cause cumQty (%s) to exceed orderQty (%s)",
                            newCumQty, orderQty));
        }

        // Calculate new leavesQty
        BigDecimal newLeavesQty = orderQty.subtract(newCumQty);

        // Store calculated values in context for subsequent tasks
        context.put("calculatedCumQty", newCumQty.setScale(QUANTITY_SCALE, RoundingMode.HALF_UP));
        context.put(
                "calculatedLeavesQty", newLeavesQty.setScale(QUANTITY_SCALE, RoundingMode.HALF_UP));

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
        return 200; // Execute after validation
    }
}
