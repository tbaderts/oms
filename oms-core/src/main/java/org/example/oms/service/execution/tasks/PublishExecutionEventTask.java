package org.example.oms.service.execution.tasks;

import java.util.function.Predicate;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.State;
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
 * Records the fill and stages both the execution and the order it changed for publication.
 *
 * <p>This task used to be a stub that logged and returned success, which meant fills reached no
 * outbox row, no event row and no topic — the executions topic the streaming service subscribes to
 * was empty by construction, and order state changes caused by fills were invisible downstream.
 *
 * <p>Publication failures are not tolerated here. The event and outbox writes are part of the same
 * transaction as the fill, so failing the task rolls the fill back rather than committing an
 * execution nobody downstream will ever hear about.
 *
 * <p>Precondition: Both order and execution must be present in context
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class PublishExecutionEventTask implements ConditionalTask<OrderTaskContext> {

    private final OrderEventAppender orderEventAppender;

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        Order order = context.getOrder();
        Execution execution = context.getExecution();

        try {
            Event event = order.getState() == State.FILLED ? Event.FILL : Event.PARTIAL_FILL;

            long version =
                    orderEventAppender.appendExecutionEvent(
                            order, execution, event, context.getCommand());

            context.put("eventVersion", version);

            log.info(
                    "Recorded {} v{} - orderId={}, execId={}, lastQty={}, lastPx={}, "
                            + "cumQty={}, leavesQty={}, state={}",
                    event,
                    version,
                    order.getOrderId(),
                    execution.getExecID(),
                    execution.getLastQty(),
                    execution.getLastPx(),
                    order.getCumQty(),
                    order.getLeavesQty(),
                    order.getState());

            return TaskResult.success(
                    getName(),
                    String.format(
                            "%s v%d recorded for orderId=%s, execId=%s",
                            event, version, order.getOrderId(), execution.getExecID()));

        } catch (Exception e) {
            log.error(
                    "Failed to record execution event for orderId={}, execId={}",
                    order.getOrderId(),
                    execution.getExecID(),
                    e);
            throw new TaskExecutionException(getName(), "Failed to record execution event", e);
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
