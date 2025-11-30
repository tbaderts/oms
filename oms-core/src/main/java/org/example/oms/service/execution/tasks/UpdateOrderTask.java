package org.example.oms.service.execution.tasks;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.function.Predicate;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.ConditionalTask;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.OrderRepository;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that updates the order entity with new quantities and state based on execution.
 * 
 * <p>Updates applied:
 * 
 * <ul>
 *   <li>cumQty - cumulative filled quantity
 *   <li>leavesQty - remaining quantity to fill
 *   <li>state - order state (LIVE or FILLED)
 * </ul>
 * 
 * <p>Note: avgPx is stored on the Execution entity, not on the Order.
 * 
 * <p>This task retrieves calculated values from the context (set by previous tasks) and applies
 * them to the order entity, then persists the updated order.
 * 
 * <p>Precondition: Order must be present in context
 */
@Component
@Slf4j
public class UpdateOrderTask implements ConditionalTask<OrderTaskContext> {

    private final OrderRepository orderRepository;

    public UpdateOrderTask(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        log.debug("Updating order for context: {}", context.getContextId());

        Order order = context.getOrder();

        try {
            // Retrieve calculated values from context
            Optional<BigDecimal> calculatedCumQty = context.get("calculatedCumQty");
            Optional<BigDecimal> calculatedLeavesQty = context.get("calculatedLeavesQty");
            Optional<State> newOrderState = context.get("newOrderState");

            if (calculatedCumQty.isEmpty()
                    || calculatedLeavesQty.isEmpty()
                    || newOrderState.isEmpty()) {
                throw new TaskExecutionException(
                        getName(),
                        "Missing calculated values in context. Ensure CalculateOrderQuantitiesTask and DetermineOrderStateTask ran first.");
            }

            // Store original values for logging
            BigDecimal originalCumQty = order.getCumQty();
            BigDecimal originalLeavesQty = order.getLeavesQty();
            State originalState = order.getState();

            // Update order with calculated values
            // Note: Order model uses builder pattern, need to rebuild
            Order updatedOrder = order.toBuilder()
                    .cumQty(calculatedCumQty.get())
                    .leavesQty(calculatedLeavesQty.get())
                    .state(newOrderState.get())
                    .build();

            // Persist updated order
            updatedOrder = orderRepository.save(updatedOrder);

            log.info(
                    "Order updated successfully - orderId={}, cumQty: {} -> {}, leavesQty: {} -> {}, "
                            + "state: {} -> {}",
                    updatedOrder.getOrderId(),
                    originalCumQty,
                    updatedOrder.getCumQty(),
                    originalLeavesQty,
                    updatedOrder.getLeavesQty(),
                    originalState,
                    updatedOrder.getState());

            // Update context with persisted order
            context.setOrder(updatedOrder);

            return TaskResult.success(
                    getName(),
                    String.format(
                            "Order updated: state=%s, cumQty=%s, leavesQty=%s",
                            updatedOrder.getState(),
                            updatedOrder.getCumQty(),
                            updatedOrder.getLeavesQty()));

        } catch (TaskExecutionException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to update order: {}", order, e);
            throw new TaskExecutionException(getName(), "Failed to update order", e);
        }
    }

    @Override
    public Predicate<OrderTaskContext> getPrecondition() {
        return OrderTaskContext::hasOrder;
    }

    @Override
    public String getSkipReason(OrderTaskContext context) {
        return "No order present in context";
    }

    @Override
    public int getOrder() {
        return 500; // Execute after execution persistence
    }
}
