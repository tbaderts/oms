package org.example.oms.service.execution.tasks;

import java.math.BigDecimal;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.common.state.OrderStateMachineConfig;
import org.example.common.state.StateMachine;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that determines and sets the appropriate order state based on execution fill status.
 * Uses the state machine to validate transitions.
 *
 * <p>State Transitions:
 *
 * <ul>
 *   <li>LIVE -> LIVE (partial fills, leavesQty > 0)
 *   <li>LIVE -> FILLED (fully filled, leavesQty = 0)
 * </ul>
 */
@Component
@Slf4j
public class DetermineOrderStateTask implements Task<OrderTaskContext> {

    private final StateMachine<State> stateMachine = OrderStateMachineConfig.createStandard();

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        log.debug("Determining order state for context: {}", context.getContextId());

        Order order = context.getOrder();

        BigDecimal calculatedLeavesQty = context.getCalculatedLeavesQty();
        if (calculatedLeavesQty == null) {
            throw new TaskExecutionException(
                    getName(),
                    "calculatedLeavesQty not found in context. CalculateOrderQuantitiesTask must run first.");
        }

        State currentState = order.getState();

        State newState;
        if (calculatedLeavesQty.compareTo(BigDecimal.ZERO) == 0) {
            newState = State.FILLED;
        } else {
            newState = State.LIVE;
        }

        if (!stateMachine.isValidTransition(currentState, newState)) {
            throw new TaskExecutionException(
                    getName(),
                    String.format("Invalid state transition from %s to %s", currentState, newState));
        }

        context.setNewOrderState(newState);

        log.info(
                "Order state determined - orderId={}, currentState={}, newState={}, leavesQty={}",
                order.getOrderId(),
                currentState,
                newState,
                calculatedLeavesQty);

        return TaskResult.success(
                getName(),
                String.format(
                        "Order state determined: %s -> %s (leavesQty=%s)",
                        currentState, newState, calculatedLeavesQty));
    }

    @Override
    public int getOrder() {
        return 300;
    }
}
