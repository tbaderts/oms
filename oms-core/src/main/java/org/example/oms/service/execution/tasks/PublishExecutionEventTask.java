package org.example.oms.service.execution.tasks;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.orchestration.ConditionalTask;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import java.util.function.Predicate;

/**
 * Task that publishes an execution event for downstream consumers.
 * 
 * <p>This task creates and publishes an event containing execution details that can be consumed by:
 * 
 * <ul>
 *   <li>Risk management systems
 *   <li>Position tracking systems
 *   <li>Client notification services
 *   <li>Audit and compliance systems
 * </ul>
 * 
 * <p>The event includes order and execution details such as orderId, execId, fill quantity, price,
 * and updated order state.
 * 
 * <p>Precondition: Both order and execution must be present in context
 */
@Component
@Slf4j
public class PublishExecutionEventTask implements ConditionalTask<OrderTaskContext> {

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        log.debug("Publishing execution event for context: {}", context.getContextId());

        Order order = context.getOrder();
        Execution execution = context.getExecution();

        try {
            // TODO: Integrate with actual event publishing mechanism
            // For now, just log the event details
            log.info(
                    "Execution event published - orderId={}, execId={}, symbol={}, side={}, "
                            + "lastQty={}, lastPx={}, cumQty={}, leavesQty={}, avgPx={}, state={}",
                    order.getOrderId(),
                    execution.getExecID(),
                    order.getSymbol(),
                    order.getSide(),
                    execution.getLastQty(),
                    execution.getLastPx(),
                    order.getCumQty(),
                    order.getLeavesQty(),
                    execution.getAvgPx(),
                    order.getState());

            // TODO: Actual event publishing logic would go here
            // Example:
            // ExecutionEvent event = new ExecutionEvent(order, execution);
            // eventPublisher.publish(event);

            return TaskResult.success(
                    getName(),
                    String.format(
                            "Execution event published for orderId=%s, execId=%s",
                            order.getOrderId(), execution.getExecID()));

        } catch (Exception e) {
            // Log error but don't fail the pipeline - event publishing is not critical
            log.error(
                    "Failed to publish execution event for orderId={}, execId={}",
                    order.getOrderId(),
                    execution.getExecID(),
                    e);

            return TaskResult.warning(
                    getName(),
                    String.format(
                            "Execution event publishing failed: %s (execution still processed successfully)",
                            e.getMessage()));
        }
    }

    @Override
    public Predicate<OrderTaskContext> getPrecondition() {
        return ctx -> ctx.hasOrder() && ctx.hasExecution();
    }

    @Override
    public String getSkipReason(OrderTaskContext context) {
        if (!context.hasOrder()) {
            return "No order present in context";
        }
        if (!context.hasExecution()) {
            return "No execution present in context";
        }
        return "Order and execution required for event publishing";
    }

    @Override
    public int getOrder() {
        return 600; // Execute after order update
    }
}
