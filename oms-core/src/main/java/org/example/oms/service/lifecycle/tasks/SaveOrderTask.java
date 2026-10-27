package org.example.oms.service.lifecycle.tasks;

import org.example.common.model.Order;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.OrderRepository;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * Saves an existing order after a lifecycle change.
 *
 * <p>{@code saveAndFlush} makes a {@code txNr} conflict surface here, inside the pipeline, rather
 * than at commit. The orchestrator turns it into a failed result carrying the exception, and the
 * processor rethrows it so that the caller retries (Kafka) or sees a 409 (REST) instead of a
 * business refusal.
 */
@Component
@RequiredArgsConstructor
public class SaveOrderTask implements Task<OrderTaskContext> {

    private final OrderRepository orderRepository;

    @Override
    public TaskResult execute(OrderTaskContext context) {
        Order saved = orderRepository.saveAndFlush(context.getOrder());
        context.setOrder(saved);
        return TaskResult.success(getName(), "Order saved: " + saved.getOrderId());
    }

    @Override
    public int getOrder() {
        return 400;
    }
}
