package org.example.oms.service.execution.tasks;

import java.util.function.Predicate;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.ConditionalTask;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.OrderRepository;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Task that updates the order entity with new quantities and state based on execution.
 *
 * <p>This task retrieves calculated values from the typed context fields and applies
 * them to the order entity, then persists the updated order.
 *
 * <p>Precondition: Order must be present in context
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class UpdateOrderTask implements ConditionalTask<OrderTaskContext> {

    private final OrderRepository orderRepository;

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        log.debug("Updating order for context: {}", context.getContextId());

        Order order = context.getOrder();

        try {
            if (context.getCalculatedCumQty() == null
                    || context.getCalculatedLeavesQty() == null
                    || context.getNewOrderState() == null) {
                throw new TaskExecutionException(
                        getName(),
                        "Missing calculated values in context. Ensure CalculateOrderQuantitiesTask and DetermineOrderStateTask ran first.");
            }

            java.math.BigDecimal originalCumQty = order.getCumQty();
            java.math.BigDecimal originalLeavesQty = order.getLeavesQty();
            State originalState = order.getState();

            Order updatedOrder = order.toBuilder()
                    .cumQty(context.getCalculatedCumQty())
                    .leavesQty(context.getCalculatedLeavesQty())
                    .state(context.getNewOrderState())
                    .build();

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
        return 500;
    }
}
