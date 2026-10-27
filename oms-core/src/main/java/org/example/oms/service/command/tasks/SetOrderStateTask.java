package org.example.oms.service.command.tasks;

import java.math.BigDecimal;
import java.time.Instant;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.common.state.OrderStateMachineConfig;
import org.example.common.state.StateMachine;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.service.sla.OrderSlaRecorder;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
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
 *   <li>Stamps the SLA checkpoints for ingress, acknowledgement and release</li>
 *   <li>Validates state transition using StateMachine</li>
 * </ul>
 *
 * <p>The SLA stamping happens here, before {@code PersistOrderTask}, so the checkpoints reach the
 * database in the same write as the state they describe. Validation has already passed by this point
 * — {@code ValidateOrderTask} runs earlier in the pipeline — which is what makes this the moment the
 * OMS has genuinely assumed responsibility for the order.
 *
 * @see <a href="file:///oms-knowledge-base/oms-concepts/order-lifecycle.md">Order Lifecycle - Initial State Transition</a>
 * @see <a href="file:///oms-knowledge-base/oms-concepts/sla-measurement.md">SLA Measurement</a>
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class SetOrderStateTask implements Task<OrderTaskContext> {

    private final OrderSlaRecorder slaRecorder;
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

        // A new order has executed nothing and has everything open (order-lifecycle.md §8.1).
        // Fills derive leavesQty from these, and the cancel request checks leavesQty > 0.
        BigDecimal cumQty = order.getCumQty() != null ? order.getCumQty() : BigDecimal.ZERO;
        BigDecimal leavesQty =
                order.getOrderQty() != null ? order.getOrderQty().subtract(cumQty) : null;

        Order.OrderBuilder<?, ?> builder =
                order.toBuilder()
                        .state(State.UNACK)
                        .cumQty(cumQty)
                        .leavesQty(leavesQty)
                        .transactTime(now);

        if (order.getSendingTime() == null) {
            builder.sendingTime(now);
        }

        Order updatedOrder = builder.build();

        // Ingress first — the two stamps below measure their latency from it, and would record
        // nothing if it were missing.
        updatedOrder = slaRecorder.stampReceived(updatedOrder, context.getReceivedTime());
        updatedOrder = slaRecorder.stampAcknowledged(updatedOrder);
        updatedOrder = slaRecorder.stampReleased(updatedOrder);

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
