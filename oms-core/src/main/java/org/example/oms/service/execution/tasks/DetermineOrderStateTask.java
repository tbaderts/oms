package org.example.oms.service.execution.tasks;

import java.math.BigDecimal;
import java.util.Optional;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that determines and sets the appropriate order state based on execution fill status.
 * 
 * <p>State Transitions:
 * 
 * <ul>
 *   <li>LIVE → LIVE (if leavesQty > 0 and cumQty > 0, stays LIVE for partial fills)
 *   <li>LIVE → FILLED (if leavesQty = 0)
 * </ul>
 * 
 * <p>The new state is stored in the context for subsequent tasks to apply to the order.
 */
@Component
@Slf4j
public class DetermineOrderStateTask implements Task<OrderTaskContext> {

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        log.debug("Determining order state for context: {}", context.getContextId());

        Order order = context.getOrder();

        // Retrieve calculated values from context
        Optional<BigDecimal> calculatedLeavesQty = context.get("calculatedLeavesQty");

        if (calculatedLeavesQty.isEmpty()) {
            throw new TaskExecutionException(
                    getName(),
                    "calculatedLeavesQty not found in context. CalculateOrderQuantitiesTask must run first.");
        }

        BigDecimal leavesQty = calculatedLeavesQty.get();
        State currentState = order.getState();

        // Determine new state based on leavesQty
        State newState;
        if (leavesQty.compareTo(BigDecimal.ZERO) == 0) {
            // Order is fully filled
            newState = State.FILLED;
        } else {
            // Order still has leaves qty - remains LIVE (partial fills keep order LIVE)
            newState = State.LIVE;
        }

        // Store new state in context
        context.put("newOrderState", newState);

        log.info(
                "Order state determined - orderId={}, currentState={}, newState={}, leavesQty={}",
                order.getOrderId(),
                currentState,
                newState,
                leavesQty);

        return TaskResult.success(
                getName(),
                String.format(
                        "Order state determined: %s -> %s (leavesQty=%s)",
                        currentState, newState, leavesQty));
    }

    @Override
    public int getOrder() {
        return 300; // Execute after quantity calculations
    }
}
