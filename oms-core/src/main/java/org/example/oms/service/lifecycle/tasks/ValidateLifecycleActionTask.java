package org.example.oms.service.lifecycle.tasks;

import java.math.BigDecimal;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.common.state.CancelStateMachineConfig;
import org.example.common.state.CancelStateMachineConfig.Node;
import org.example.common.state.OrderStateMachines;
import org.example.common.state.StateMachine;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.service.lifecycle.LifecycleAction;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Decides whether a lifecycle action may be applied to the order as it stands.
 *
 * <p>State changes are checked against the standard state machine, the same instance every other
 * processor uses. The two cancel-state-only actions are checked against the cancel state machine
 * ({@link CancelStateMachineConfig}, SPEC-0044), plus what they require of the order itself. Each
 * precondition stops holding once its action has been applied, which is what makes the commands
 * idempotent: a redelivered command is refused here and writes nothing.
 *
 * @see <a href="file:///oms-knowledge-base/oms-concepts/order-lifecycle.md">Order Lifecycle</a>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ValidateLifecycleActionTask implements Task<OrderTaskContext> {

    private final OrderStateMachines stateMachines;

    private final StateMachine<Node> cancelStates = CancelStateMachineConfig.create();

    @Override
    public TaskResult execute(OrderTaskContext context) {
        LifecycleAction action = context.getLifecycleAction();
        Order order = context.getOrder();
        State state = order.getState() != null ? order.getState() : State.NEW;

        boolean allowed =
                switch (action) {
                    // Only an acknowledgement of an order awaiting one: FILLED → LIVE is in the machine for
                    // busts only (SPEC-0044), so the source state is named here.
                    case ACCEPT -> state == State.UNACK
                            && stateMachines.forOrder(order).isValidTransition(state, action.getTargetState());
                    case REJECT, CANCEL, EXPIRE, CLOSE -> stateMachines.forOrder(order).isValidTransition(state, action.getTargetState());
                    case CANCEL_REQUEST ->
                            state == State.LIVE
                                    && isPositive(order.getLeavesQty())
                                    && cancelStates.isValidTransition(Node.of(order.getCancelState()), Node.PCXL);
                    // A pending cancel survives expiry and close; a CLOSED order still takes nothing more.
                    case CANCEL_REJECT ->
                            state != State.CLOSED
                                    && cancelStates.isValidTransition(Node.of(order.getCancelState()), Node.REJ);
                };

        if (!allowed) {
            String message =
                    String.format(
                            "%s not allowed for order %s in state %s/%s",
                            action, order.getOrderId(), state, order.getCancelState());
            context.markValidationFailed(message);
            log.warn("Lifecycle action refused: {}", message);
            return TaskResult.failed(getName(), message);
        }

        return TaskResult.success(getName(), action + " allowed for order " + order.getOrderId());
    }

    private static boolean isPositive(BigDecimal value) {
        return value != null && value.signum() > 0;
    }

    @Override
    public int getOrder() {
        return 100;
    }
}
