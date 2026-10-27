package org.example.oms.service.lifecycle;

import java.time.Instant;

import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.OrderCancelCmd;
import org.example.common.model.cmd.OrderCancelRejectCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderRejectCmd;
import org.example.common.orchestration.TaskOrchestrator;
import org.example.common.orchestration.TaskOrchestrator.PipelineResult;
import org.example.common.orchestration.TaskPipeline;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.service.command.tasks.PublishOrderEventTask;
import org.example.oms.service.lifecycle.tasks.ApplyLifecycleActionTask;
import org.example.oms.service.lifecycle.tasks.DeduplicateCommandTask;
import org.example.oms.service.lifecycle.tasks.LoadOrderTask;
import org.example.oms.service.lifecycle.tasks.SaveOrderTask;
import org.example.oms.service.lifecycle.tasks.ValidateLifecycleActionTask;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import io.micrometer.observation.annotation.Observed;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Processes the commands a market or a client sends against an existing order: reject, cancel,
 * cancel request and cancel reject.
 *
 * <p>All four share one pipeline (load → deduplicate → validate → apply → save → record event), driven by the
 * {@link LifecycleAction} table, so the rules sit in one place instead of four near-identical
 * processors.
 *
 * <p>A refusal (unknown order, action not allowed in the current state, or a duplicate delivery)
 * is a result, not an exception, and leaves no trace: the transaction is rolled back. An optimistic
 * locking conflict is rethrown, because retrying it can succeed.
 *
 * @see <a href="file:///oms-knowledge-base/oms-concepts/order-lifecycle.md">Order Lifecycle</a>
 * @see <a href="file:///oms-knowledge-base/oms-concepts/exchange-simulator.md">Exchange Simulator</a>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderLifecycleCommandProcessor {

    private final TaskOrchestrator orchestrator;
    private final LoadOrderTask loadOrderTask;
    private final DeduplicateCommandTask deduplicateCommandTask;
    private final ValidateLifecycleActionTask validateLifecycleActionTask;
    private final ApplyLifecycleActionTask applyLifecycleActionTask;
    private final SaveOrderTask saveOrderTask;
    private final PublishOrderEventTask publishOrderEventTask;

    /** Whether this processor handles the given command type. */
    public static boolean supports(Command command) {
        return command instanceof OrderRejectCmd
                || command instanceof OrderCancelCmd
                || command instanceof OrderCancelRequestCmd
                || command instanceof OrderCancelRejectCmd;
    }

    /**
     * Applies a lifecycle command.
     *
     * @param command one of the four lifecycle commands
     * @param receivedTime when the command crossed the OMS boundary; logged for diagnosis
     * @throws IllegalArgumentException if the command is not a lifecycle command
     * @throws OptimisticLockingFailureException if the order changed concurrently
     */
    @Transactional
    @Observed(name = "oms.order-lifecycle-processor.process")
    public OrderLifecycleResult process(Command command, Instant receivedTime) {
        LifecycleAction action;
        String orderId;
        String text;

        switch (command) {
            case OrderRejectCmd cmd -> {
                action = LifecycleAction.REJECT;
                orderId = cmd.getOrderId();
                text = cmd.getText();
            }
            case OrderCancelCmd cmd -> {
                action = LifecycleAction.CANCEL;
                orderId = cmd.getOrderId();
                text = cmd.getText();
            }
            case OrderCancelRequestCmd cmd -> {
                action = LifecycleAction.CANCEL_REQUEST;
                orderId = cmd.getOrderId();
                text = null;
            }
            case OrderCancelRejectCmd cmd -> {
                action = LifecycleAction.CANCEL_REJECT;
                orderId = cmd.getOrderId();
                text = cmd.getText();
            }
            default ->
                    throw new IllegalArgumentException(
                            "Not a lifecycle command: " + command.getClass().getName());
        }

        log.info("Processing {} for orderId={}, receivedTime={}", action, orderId, receivedTime);

        OrderTaskContext context = new OrderTaskContext();
        context.setCommand(command);
        context.setLifecycleAction(action);
        context.setReceivedTime(receivedTime);
        context.put(LoadOrderTask.ORDER_ID, orderId);
        if (text != null) {
            context.put(ApplyLifecycleActionTask.REASON, text);
        }

        PipelineResult result = orchestrator.execute(buildPipeline(), context);

        if (!result.isSuccess()) {
            markRollbackOnly();
            rethrowConcurrencyConflict(result);
            log.warn("{} refused for orderId={}: {}", action, orderId, context.getErrorMessage());
            return OrderLifecycleResult.builder()
                    .success(false)
                    .orderId(orderId)
                    .action(action)
                    .errorMessage(errorMessage(context, result))
                    .build();
        }

        log.info(
                "{} applied to orderId={}, state={}, cancelState={}",
                action,
                orderId,
                context.getOrder().getState(),
                context.getOrder().getCancelState());

        return OrderLifecycleResult.builder().success(true).orderId(orderId).action(action).build();
    }

    private TaskPipeline<OrderTaskContext> buildPipeline() {
        return TaskPipeline.<OrderTaskContext>builder("OrderLifecyclePipeline")
                .addTask(loadOrderTask)
                .addTask(deduplicateCommandTask)
                .addTask(validateLifecycleActionTask)
                .addTask(applyLifecycleActionTask)
                .addTask(saveOrderTask)
                .addTask(publishOrderEventTask)
                .sortByOrder(true)
                .stopOnFailure(true)
                .build();
    }

    /** Rolls back whatever earlier tasks wrote; a refused command must leave no trace. */
    private static void markRollbackOnly() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        }
    }

    private static void rethrowConcurrencyConflict(PipelineResult result) {
        result.getTaskResults().stream()
                .filter(TaskResult::isFailed)
                .flatMap(taskResult -> taskResult.getException().stream())
                .filter(OptimisticLockingFailureException.class::isInstance)
                .map(OptimisticLockingFailureException.class::cast)
                .findFirst()
                .ifPresent(
                        conflict -> {
                            throw conflict;
                        });
    }

    private static String errorMessage(OrderTaskContext context, PipelineResult result) {
        if (context.getErrorMessage() != null) {
            return context.getErrorMessage();
        }
        return result.getTaskResults().stream()
                .filter(TaskResult::isFailed)
                .map(TaskResult::getMessage)
                .findFirst()
                .orElse("Lifecycle command failed");
    }

    @Builder
    @Getter
    public static class OrderLifecycleResult {
        private final boolean success;
        private final String orderId;
        private final LifecycleAction action;
        private final String errorMessage;
    }
}
