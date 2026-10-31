package org.example.oms.service.lifecycle.tasks;

import static org.example.oms.service.OrderEventAppender.commandIdOf;

import org.example.common.model.cmd.Command;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.OrderEventRepository;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Refuses a lifecycle command the order has already applied, identified by its commandId.
 *
 * <p>State preconditions catch most duplicates, but not a replay. After a cancel request and a
 * cancel reject the order is LIVE again with cancel state REJ, so a redelivered cancel request
 * satisfies its precondition once more. Kafka produces exactly that sequence when a consumer dies
 * before committing. The commandId is what tells a replay apart from a genuinely new request.
 *
 * <p>The order's own event log is the record of applied commands: each event stores its command's
 * commandId in {@code order_events.command_id}, unique per order, so the check is one indexed
 * lookup, needs no table of its own and cannot drift from what was applied. A commandId identifies
 * one command, so any lifecycle command reusing it is refused. A command without a commandId is not
 * checked; its state precondition still applies.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class DeduplicateCommandTask implements Task<OrderTaskContext> {

    private final OrderEventRepository orderEventRepository;

    @Override
    public TaskResult execute(OrderTaskContext context) {
        Command command = context.getCommand();
        String commandId = commandIdOf(command);
        if (commandId == null) {
            return TaskResult.success(getName(), "No commandId; relying on state preconditions");
        }

        String orderId = context.getOrder().getOrderId();
        if (orderEventRepository.existsByOrderIdAndCommandId(orderId, commandId)) {
            String message = "Duplicate command " + commandId + " for order " + orderId;
            context.markValidationFailed(message);
            log.warn("Lifecycle command refused: {}", message);
            return TaskResult.failed(getName(), message);
        }

        return TaskResult.success(getName(), "Command " + commandId + " not yet applied");
    }

    @Override
    public int getOrder() {
        return 75;
    }
}
