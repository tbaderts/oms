package org.example.oms.service.command.tasks;

import java.util.function.Predicate;

import org.example.common.model.Order;
import org.example.common.orchestration.ConditionalTask;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.OrderRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that persists the order to the database. Only executes if validation has passed and the
 * order is in a valid state.
 */
@Component
@Slf4j
public class PersistOrderTask implements ConditionalTask<OrderTaskContext> {

    private final OrderRepository orderRepository;

    public PersistOrderTask(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        try {
            Order order = context.getOrder();

            if (orderRepository.existsBySessionIdAndClOrdId(order.getSessionId(), order.getClOrdId())) {
                String message =
                        "Duplicate order for sessionId="
                                + order.getSessionId()
                                + " and clOrdId="
                                + order.getClOrdId();
                context.markValidationFailed(message);
                log.warn("Idempotence check failed: {}", message);
                return TaskResult.failed(getName(), message);
            }

            Order savedOrder = orderRepository.save(order);

            // Update context with persisted order (now has database ID)
            context.setOrder(savedOrder);

            log.info(
                    "Order persisted with ID: {}, orderId: {}, symbol: {}",
                    savedOrder.getId(),
                    savedOrder.getOrderId(),
                    savedOrder.getSymbol());

            // Store database ID in context
            context.put("databaseId", savedOrder.getId());

            return TaskResult.success(getName(), "Order persisted with ID: " + savedOrder.getId());

        } catch (DataIntegrityViolationException e) {
            Order order = context.getOrder();
            String message =
                    "Duplicate order for sessionId="
                            + order.getSessionId()
                            + " and clOrdId="
                            + order.getClOrdId();
            context.markValidationFailed(message);
            log.warn("Idempotence constraint violation: {}", message);
            return TaskResult.failed(getName(), message);

        } catch (Exception e) {
            log.error("Failed to persist order: {}", e.getMessage(), e);
            throw new TaskExecutionException(getName(), "Failed to persist order", e);
        }
    }

    @Override
    public Predicate<OrderTaskContext> getPrecondition() {
        // Only persist if validation passed and order is valid
        return OrderTaskContext::isValid;
    }

    @Override
    public String getSkipReason(OrderTaskContext context) {
        return "Order validation failed, skipping persistence: " + context.getErrorMessage();
    }

    @Override
    public int getOrder() {
        return 400; // Execute after state is set
    }
}
