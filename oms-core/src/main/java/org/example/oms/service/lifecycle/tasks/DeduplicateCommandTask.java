package org.example.oms.service.lifecycle.tasks;

import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.OrderCancelCmd;
import org.example.common.model.cmd.OrderCancelRejectCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderRejectCmd;
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
 * <p>The order's own event log is the record of applied commands, each event storing its command,
 * so the check needs no table of its own and cannot drift from what was applied. A command without
 * a commandId is not checked; its state precondition still applies.
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
        boolean applied =
                orderEventRepository.findByOrderIdOrderByVersionAsc(orderId).stream()
                        .map(event -> event.getTransaction())
                        .anyMatch(
                                previous ->
                                        previous != null
                                                && previous.getClass() == command.getClass()
                                                && commandId.equals(commandIdOf(previous)));

        if (applied) {
            String message = "Duplicate command " + commandId + " for order " + orderId;
            context.markValidationFailed(message);
            log.warn("Lifecycle command refused: {}", message);
            return TaskResult.failed(getName(), message);
        }

        return TaskResult.success(getName(), "Command " + commandId + " not yet applied");
    }

    static String commandIdOf(Command command) {
        return switch (command) {
            case OrderRejectCmd cmd -> cmd.getCommandId();
            case OrderCancelCmd cmd -> cmd.getCommandId();
            case OrderCancelRequestCmd cmd -> cmd.getCommandId();
            case OrderCancelRejectCmd cmd -> cmd.getCommandId();
            case null, default -> null;
        };
    }

    @Override
    public int getOrder() {
        return 75;
    }
}
