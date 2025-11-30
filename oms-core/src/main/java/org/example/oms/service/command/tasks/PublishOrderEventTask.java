package org.example.oms.service.command.tasks;

import java.util.function.Predicate;

import org.example.common.model.Order;
import org.example.common.orchestration.ConditionalTask;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderOutbox;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.model.ProcessingEvent;
import org.example.oms.repository.OrderOutboxRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that publishes the order creation event to the outbox for downstream processing. This task
 * creates an outbox entry and publishes a processing event.
 *
 * <p>Only executes if the order has been successfully persisted (has a database ID).
 */
@Component
@Slf4j
public class PublishOrderEventTask implements ConditionalTask<OrderTaskContext> {

    private final OrderOutboxRepository orderOutboxRepository;
    private final ApplicationEventPublisher eventPublisher;

    public PublishOrderEventTask(
            OrderOutboxRepository orderOutboxRepository, ApplicationEventPublisher eventPublisher) {
        this.orderOutboxRepository = orderOutboxRepository;
        this.eventPublisher = eventPublisher;
    }

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        try {
            Order order = context.getOrder();

            // Create outbox entry
            OrderOutbox outbox = OrderOutbox.builder().order(order).build();

            OrderOutbox savedOutbox = orderOutboxRepository.save(outbox);

            log.info(
                    "Created outbox entry with ID: {} for order: {}",
                    savedOutbox.getId(),
                    order.getOrderId());

            // Publish event for transactional event listener
            ProcessingEvent event = ProcessingEvent.builder().orderOutbox(savedOutbox).build();

            eventPublisher.publishEvent(event);

            log.info("Published processing event for order: {}", order.getOrderId());

            // Store outbox ID in context
            context.put("outboxId", savedOutbox.getId());

            return TaskResult.success(
                    getName(), "Event published for order: " + order.getOrderId());

        } catch (Exception e) {
            log.error("Failed to publish order event: {}", e.getMessage(), e);
            throw new TaskExecutionException(getName(), "Failed to publish order event", e);
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
