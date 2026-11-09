package org.example.oms.service.command.tasks;

import org.example.common.model.Order;
import org.example.common.model.cmd.Command;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Refuses a command that names an order version other than the order's current one (SPEC-0050).
 *
 * <p>A sender sets {@code expectedVersion} to the order's version as it saw it (its
 * {@code eventVersion} on search; 0 for a create, whose order is new). If the order has moved on,
 * the command was decided on a stale view: it is refused, not treated as a conflict, since sending
 * it again cannot succeed. Without {@code expectedVersion} there is no check.
 *
 * <p>Runs in the create, lifecycle and fill pipelines, after the order was loaded under its row
 * lock (so it compares against the version the command would change) and after
 * {@code DeduplicateCommandTask} (75), so a resent command is still reported as a duplicate.
 */
@Component
@Slf4j
public class CheckExpectedVersionTask implements Task<OrderTaskContext> {

    @Override
    public TaskResult execute(OrderTaskContext context) {
        Command command = context.getCommand();
        Long expected = command != null ? command.getExpectedVersion() : null;
        if (expected == null) {
            return TaskResult.success(getName(), "No expected version");
        }
        Order order = context.getOrder();
        long actual = order != null ? order.getTxNr() : 0;
        if (expected == actual) {
            return TaskResult.success(getName(), "Order is at the expected version " + actual);
        }
        String message = command instanceof org.example.common.model.cmd.OrderCreateCmd
                ? String.format("Expected version %d but the order is new (version 0)", expected)
                : String.format("Expected version %d but order %s is at version %d", expected,
                        order != null ? order.getOrderId() : "(unknown)", actual);
        log.warn("Command refused on version: {}", message);
        return TaskResult.failed(getName(), message);
    }

    @Override
    public int getOrder() {
        return 80;
    }
}
