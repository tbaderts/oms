package org.example.oms.service.command.tasks;

import java.util.UUID;
import java.util.function.Predicate;

import org.example.common.model.Order;
import org.example.common.orchestration.ConditionalTask;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that assigns a unique order ID to the order if not already present. This task only executes
 * if the order doesn't already have an orderId.
 */
@Component
@Slf4j
public class AssignOrderIdTask implements ConditionalTask<OrderTaskContext> {

    @Override
    public TaskResult execute(OrderTaskContext context) {
        Order order = context.getOrder();

        // Generate unique order ID
        String orderId = "ORD-" + UUID.randomUUID().toString();

        // Use builder to create updated order with ID
        Order updatedOrder = order.toBuilder().orderId(orderId).build();
        context.setOrder(updatedOrder);
        context.setGeneratedOrderId(orderId);

        log.info("Assigned order ID: {}", orderId);

        // Store in context for other tasks
        context.put("orderId", orderId);

        return TaskResult.success(getName(), "Order ID assigned: " + orderId);
    }

    @Override
    public Predicate<OrderTaskContext> getPrecondition() {
        // Only execute if order doesn't have an ID yet
        return ctx ->
                ctx.getOrder() != null
                        && (ctx.getOrder().getOrderId() == null
                                || ctx.getOrder().getOrderId().isBlank());
    }

    @Override
    public String getSkipReason(OrderTaskContext context) {
        return "Order already has an ID: " + context.getOrder().getOrderId();
    }

    @Override
    public int getOrder() {
        return 200; // Execute after validation
    }
}
