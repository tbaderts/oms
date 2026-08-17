package org.example.oms.service.command.tasks;

import java.util.function.Predicate;

import org.example.common.model.Order;
import org.example.common.orchestration.ConditionalTask;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.Event;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.service.OrderEventAppender;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Records the order-created event and stages the new order for publication.
 *
 * <p>Only executes if the order has been successfully persisted (has a database ID).
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class PublishOrderEventTask implements ConditionalTask<OrderTaskContext> {

    private final OrderEventAppender orderEventAppender;

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        try {
            Order order = context.getOrder();

            long version =
                    orderEventAppender.appendOrderEvent(
                            order, Event.NEW_ORDER, context.getCommand());

            context.put("eventVersion", version);

            log.info("Recorded NEW_ORDER v{} for order {}", version, order.getOrderId());

            return TaskResult.success(
                    getName(), "Event recorded for order: " + order.getOrderId());

        } catch (Exception e) {
            log.error("Failed to record order event: {}", e.getMessage(), e);
            throw new TaskExecutionException(getName(), "Failed to record order event", e);
        }
    }

    @Override
    public Predicate<OrderTaskContext> getPrecondition() {
        // Only publish if order has been persisted (has database ID)
        return ctx -> ctx.getOrder() != null && ctx.getOrder().getId() != null;
    }

    @Override
    public String getSkipReason(OrderTaskContext context) {
        return "Order not yet persisted, skipping event publication";
    }

    @Override
    public int getOrder() {
        return 500; // Execute after persistence
    }
}
