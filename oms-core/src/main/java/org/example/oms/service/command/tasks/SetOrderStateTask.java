package org.example.oms.service.command.tasks;

import java.time.LocalDateTime;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that sets the initial order state and timestamps for a new order. This task prepares the
 * order for persistence by setting:
 *
 * <ul>
 *   <li>State to UNACK (unacknowledged)
 *   <li>Transaction time to current time
 *   <li>Sending time if not already set
 * </ul>
 */
@Component
@Slf4j
public class SetOrderStateTask implements Task<OrderTaskContext> {

    @Override
    public TaskResult execute(OrderTaskContext context) {
        Order order = context.getOrder();

        // Set current timestamp
        LocalDateTime now = LocalDateTime.now();

        // Build updated order with state and timestamps
        Order.OrderBuilder<?, ?> builder =
                order.toBuilder()
                        .state(State.UNACK) // Set initial state to unacknowledged
                        .transactTime(now);

        // Set sending time if not already present
        if (order.getSendingTime() == null) {
            builder.sendingTime(now);
        }

        Order updatedOrder = builder.build();
        context.setOrder(updatedOrder);
        context.setTargetState(State.UNACK);

        log.info(
                "Set order state to UNACK for order: {} at {}",
                order.getClOrdId(),
                now);

        return TaskResult.success(getName(), "Order state set to UNACK");
    }

    @Override
    public int getOrder() {
        return 300; // Execute after ID assignment
    }
}
