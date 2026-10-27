package org.example.oms.service.lifecycle.tasks;

import org.example.common.model.Order;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.OrderRepository;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Loads the order a lifecycle command refers to. The command's orderId is read from the context key
 * {@link #ORDER_ID}, which the processor sets.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class LoadOrderTask implements Task<OrderTaskContext> {

    /** Context key carrying the orderId named by the command. */
    public static final String ORDER_ID = "orderId";

    private final OrderRepository orderRepository;

    @Override
    public TaskResult execute(OrderTaskContext context) {
        String orderId = context.<String>get(ORDER_ID).orElse(null);

        if (orderId == null || orderId.isBlank()) {
            return fail(context, "orderId is required");
        }

        Order order = orderRepository.findByOrderId(orderId).orElse(null);
        if (order == null) {
            return fail(context, "Order not found: " + orderId);
        }

        context.setOrder(order);
        return TaskResult.success(getName(), "Loaded order " + orderId);
    }

    private TaskResult fail(OrderTaskContext context, String message) {
        context.markValidationFailed(message);
        return TaskResult.failed(getName(), message);
    }

    @Override
    public int getOrder() {
        return 50;
    }
}
