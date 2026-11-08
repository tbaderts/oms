package org.example.oms.service.command;

import java.util.List;

import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCancelCmd;
import org.example.common.model.cmd.OrderCancelRejectCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderCloseCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.OrderExpireCmd;
import org.example.common.model.cmd.OrderRejectCmd;
import org.example.common.orchestration.TaskResult;
import org.example.oms.mapper.OrderMapper;
import org.example.oms.service.OrderEventAppender;
import org.example.oms.service.commandlog.CommandLogWriter;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.example.oms.service.lifecycle.LifecycleAction;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * The one place a command is routed to its processor, and its outcome logged (SPEC-0046). Every
 * entry point (REST, the Kafka listener, the scheduled jobs) dispatches here.
 *
 * <p>The dispatch opens the command's transaction, which the processor joins:
 *
 * <ul>
 *   <li>applied: the command-log row is written in that transaction, so it exists exactly when the
 *       change committed;
 *   <li>refused: the transaction rolls back, and the row is written on its own. This method marks
 *       its own transaction rollback-only too, so the commit rolls back quietly rather than failing
 *       on the rollback-only the processor set;
 *   <li>an exception: the row is written on its own as failed, and the exception is rethrown for the
 *       entry point to answer (REST) or retry and dead-letter (Kafka).
 * </ul>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class CommandDispatcher {

    private final OrderCreateCommandProcessor orderCreateCommandProcessor;
    private final ExecutionCommandProcessor executionCommandProcessor;
    private final OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;
    private final OrderMapper orderMapper;
    private final CommandLogWriter commandLog;
    private final EntityManager entityManager;

    @Transactional
    public CommandDispatch dispatch(Command command, CommandOrigin origin) {
        CommandDispatch outcome;
        try {
            outcome = route(command, origin);
            if (outcome instanceof CommandDispatch.Applied applied) {
                commandLog.applied(command, origin, applied.orderId(), applied.eventVersion());
                // Write everything now, while a failure can still be logged as one: left to the
                // commit, it would roll back the APPLIED row with the change and leave no trace.
                entityManager.flush();
            }
        } catch (RuntimeException e) {
            commandLog.failed(command, origin, orderIdOf(command), reasonOf(e));
            throw e;
        }

        switch (outcome) {
            case CommandDispatch.Applied applied -> {
                // Logged above, in the command's transaction.
            }
            case CommandDispatch.Refused refused -> {
                markRollbackOnly();
                commandLog.refused(command, origin, refused.orderId(), refused.reason());
            }
            case CommandDispatch.Unsupported unsupported -> {
                markRollbackOnly();
                commandLog.refused(command, origin, unsupported.orderId(), unsupported.message());
            }
        }
        return outcome;
    }

    private CommandDispatch route(Command command, CommandOrigin origin) {
        if (command instanceof OrderCreateCmd create) {
            var result = orderCreateCommandProcessor.process(create, origin.receivedAt());
            if (result.isSuccess()) {
                return new CommandDispatch.Applied(
                        result.getOrderId(), result.getOrderId(), result.getEventVersion(),
                        "Order created successfully: " + result.getOrderId(), true);
            }
            // A refused create never got an order: the id assigned in the pipeline was rolled back.
            return refused(command, null, result.getErrorMessage(), result.isDuplicate(),
                    "Order creation failed: " + result.getErrorMessage());
        }

        if (command instanceof ExecutionCreateCmd fill) {
            var execution = orderMapper.toExecution(fill.getExecution());
            var result = executionCommandProcessor.process(execution, fill);
            if (result.isSuccess()) {
                return new CommandDispatch.Applied(
                        result.getOrder().getOrderId(), result.getExecution().getExecId(), result.getEventVersion(),
                        "Execution processed successfully", true);
            }
            String reason = result.getErrorMessage() != null
                    ? result.getErrorMessage()
                    : firstFailure(result.getTaskResults(), "Execution processing failed");
            return refused(command, orderIdOf(command), reason, result.isDuplicate(), "Execution processing failed");
        }

        if (OrderLifecycleCommandProcessor.supports(command)) {
            var result = orderLifecycleCommandProcessor.process(command, origin.receivedAt());
            boolean accept = result.getAction() == LifecycleAction.ACCEPT;
            if (result.isSuccess()) {
                return new CommandDispatch.Applied(
                        result.getOrderId(), result.getOrderId(), result.getEventVersion(),
                        accept
                                ? "Order accepted successfully: " + result.getOrderId()
                                : result.getAction() + " applied to order " + result.getOrderId(),
                        false);
            }
            return refused(command, result.getOrderId(), result.getErrorMessage(), result.isDuplicate(),
                    accept ? "Order acceptance failed: " + result.getErrorMessage() : result.getErrorMessage());
        }

        String type = CommandLogWriter.typeOf(command);
        log.warn("Unsupported command type: {}", type);
        return new CommandDispatch.Unsupported(orderIdOf(command), type, "Command type not yet implemented: " + type);
    }

    private static CommandDispatch.Refused refused(
            Command command, String orderId, String reason, boolean duplicate, String message) {
        return new CommandDispatch.Refused(orderId, reason, duplicate, OrderEventAppender.commandIdOf(command), message);
    }

    /** The order a command names, before any processor ran; null for a create, which has none yet. */
    static String orderIdOf(Command command) {
        return switch (command) {
            case ExecutionCreateCmd cmd -> cmd.getExecution() != null ? cmd.getExecution().getOrderId() : null;
            case OrderAcceptCmd cmd -> cmd.getOrderId();
            case OrderRejectCmd cmd -> cmd.getOrderId();
            case OrderCancelCmd cmd -> cmd.getOrderId();
            case OrderCancelRequestCmd cmd -> cmd.getOrderId();
            case OrderCancelRejectCmd cmd -> cmd.getOrderId();
            case OrderExpireCmd cmd -> cmd.getOrderId();
            case OrderCloseCmd cmd -> cmd.getOrderId();
            case null, default -> null;
        };
    }

    private static String firstFailure(List<TaskResult> results, String fallback) {
        return results == null
                ? fallback
                : results.stream().filter(TaskResult::isFailed).map(TaskResult::getMessage).findFirst().orElse(fallback);
    }

    private static String reasonOf(Throwable e) {
        Throwable cause = NestedExceptionUtils.getMostSpecificCause(e);
        String message = cause.getMessage() != null ? cause.getMessage() : cause.getClass().getSimpleName();
        return cause == e ? message : e.getMessage() + ": " + message;
    }

    private static void markRollbackOnly() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        }
    }
}
