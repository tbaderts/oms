package org.example.oms.service.command.tasks;

import java.time.Instant;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.common.state.OrderStateMachineConfig;
import org.example.common.state.StateMachine;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that sets the initial order state and timestamps for a new order. Uses the state machine
 * to validate the transition from NEW to UNACK.
 *
 * <p>This task:
 * <ul>
 *   <li>Sets order state to UNACK (pending acknowledgment)</li>
 *   <li>Sets transactTime to current timestamp</li>
 *   <li>Sets sendingTime if not already set</li>
 *   <li>Validates state transition using StateMachine</li>
 * </ul>
 *
 * @see <a href="file:///oms-knowledge-base/oms-concepts/order-lifecycle.md">Order Lifecycle - Initial State Transition</a>
 */
@Component
@Slf4j
public class SetOrderStateTask implements Task<OrderTaskContext> {

    private final StateMachine<State> stateMachine = OrderStateMachineConfig.createStandard();

    @Override
    public TaskResult execute(OrderTaskContext context) {
        Order order = context.getOrder();

        State currentState = order.getState() != null ? order.getState() : State.NEW;

        if (!stateMachine.isValidTransition(currentState, State.UNACK)) {
            context.markValidationFailed(
                    String.format("Invalid state transition from %s to UNACK", currentState));
            return TaskResult.failed(getName(),
                    String.format("Invalid state transition from %s to UNACK", currentState));
        }

        Instant now = Instant.now();

        Order.OrderBuilder<?, ?> builder =
                order.toBuilder()
                        .state(State.UNACK)
                        .transactTime(now);

        if (order.getSendingTime() == null) {
            builder.sendingTime(now);
        }

        Order updatedOrder = builder.build();
        context.setOrder(updatedOrder);
        context.setTargetState(State.UNACK);

        log.info("Set order state to UNACK for order: {} at {}", order.getClOrdId(), now);

        return TaskResult.success(getName(), "Order state set to UNACK");
    }

    @Override
    public int getOrder() {
        return 300;
    }
}
