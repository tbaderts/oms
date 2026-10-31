package org.example.oms.service.execution.tasks;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.projection.Projection;
import org.example.oms.projection.ProjectionContext;
import org.example.oms.projection.StagedMessage;
import org.example.oms.service.OrderEventAppender;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Runs every projection for the fill and stages their messages, inside the command transaction
 * (SPEC-0020).
 *
 * <p>Runs after {@link PublishExecutionEventTask}: that is where the event version a projection
 * records is assigned, and staging after it keeps the outbox order the consumers rely on (the order
 * message, the execution message, then projection messages). A projection failure fails the task,
 * so the pipeline fails and the whole fill rolls back rather than leaving a view that disagrees
 * with the order.
 */
@Component
@Slf4j
public class ProjectTask implements Task<OrderTaskContext> {

    private final List<Projection> projections;
    private final OrderEventAppender orderEventAppender;

    public ProjectTask(List<Projection> projections, OrderEventAppender orderEventAppender) {
        this.projections = projections.stream().sorted(Comparator.comparing(Projection::name)).toList();
        this.orderEventAppender = orderEventAppender;
    }

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        Order order = context.getOrder();
        Execution execution = context.getExecution();
        Long version = context.getOrDefault("eventVersion", null);
        if (version == null) {
            throw new TaskExecutionException(getName(), "No event version in context for orderId=" + order.getOrderId());
        }
        ProjectionContext change = new ProjectionContext(order, execution, version, context.getCommand(), Instant.now());

        for (Projection projection : projections) {
            List<StagedMessage> messages;
            try {
                messages = projection.project(change);
            } catch (RuntimeException e) {
                log.error(
                        "Projection {} failed - orderId={}, execId={}, version={}",
                        projection.name(),
                        order.getOrderId(),
                        execution.getExecID(),
                        version,
                        e);
                throw new TaskExecutionException(getName(), "Projection " + projection.name() + " failed", e);
            }
            messages.forEach(orderEventAppender::stageMessage);
        }

        return TaskResult.success(
                getName(),
                String.format("%d projection(s) applied for orderId=%s v%d", projections.size(), order.getOrderId(), version));
    }

    @Override
    public int getOrder() {
        return 700; // After PublishExecutionEventTask, which assigns the event version
    }
}
