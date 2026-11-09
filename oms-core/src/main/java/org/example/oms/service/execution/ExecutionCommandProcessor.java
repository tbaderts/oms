package org.example.oms.service.execution;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.cmd.Command;
import org.example.common.orchestration.TaskOrchestrator;
import org.example.common.orchestration.TaskOrchestrator.PipelineResult;
import org.example.common.orchestration.TaskPipeline;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.PipelineResults;
import org.example.oms.service.execution.tasks.CalculateOrderQuantitiesTask;
import org.example.oms.service.execution.tasks.DetermineOrderStateTask;
import org.example.oms.service.execution.tasks.PersistExecutionTask;
import org.example.oms.service.execution.tasks.ProjectTask;
import org.example.oms.service.execution.tasks.PublishExecutionEventTask;
import org.example.oms.service.execution.tasks.UpdateOrderTask;
import org.example.oms.service.execution.tasks.ValidateExecutionTask;
import org.example.oms.service.lifecycle.tasks.DeduplicateCommandTask;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

import io.micrometer.observation.annotation.Observed;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.oms.service.command.LoadedOrders;

/**
 * Command processor for handling execution reports. Assembles and executes a task pipeline to
 * process order fills and update order state accordingly.
 *
 * <p>The execution pipeline consists of 7 ordered tasks:
 * <ol>
 *   <li>ValidateExecutionTask - Validates execution report fields</li>
 *   <li>CalculateOrderQuantitiesTask - Calculates cumQty, leavesQty</li>
 *   <li>DetermineOrderStateTask - Determines new order state</li>
 *   <li>PersistExecutionTask - Saves execution to database</li>
 *   <li>UpdateOrderTask - Updates order with new quantities and state</li>
 *   <li>PublishExecutionEventTask - Publishes event to outbox</li>
 *   <li>ProjectTask - Updates the projections and stages their messages (SPEC-0020)</li>
 * </ol>
 *
 * @see <a href="file:///oms-knowledge-base/oms-concepts/execution-reporting.md">Execution Reporting - 6-Task Pipeline</a>
 * @see <a href="file:///oms-knowledge-base/oms-concepts/order-lifecycle.md">Order Lifecycle - State Transitions</a>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ExecutionCommandProcessor {

    private final TaskOrchestrator orchestrator;
    private final OrderRepository orderRepository;
    private final ValidateExecutionTask validateExecutionTask;
    private final DeduplicateCommandTask deduplicateCommandTask;
    private final org.example.oms.service.command.tasks.CheckExpectedVersionTask checkExpectedVersionTask;
    private final CalculateOrderQuantitiesTask calculateOrderQuantitiesTask;
    private final DetermineOrderStateTask determineOrderStateTask;
    private final PersistExecutionTask persistExecutionTask;
    private final UpdateOrderTask updateOrderTask;
    private final PublishExecutionEventTask publishExecutionEventTask;
    private final ProjectTask projectTask;

    /**
     * Applies a fill.
     *
     * @param execution the fill, mapped from the command
     * @param command the command that reported it; required, because the fill's event stores it and
     *     the command-less overload that let the log lose it is gone (SPEC-0046)
     */
    @Transactional
    @Observed(name = "oms.execution-processor.process")
    public ExecutionProcessingResult process(Execution execution, Command command) {
        java.util.Objects.requireNonNull(command, "A fill is always applied with the command that reported it");
        log.info(
                "Processing execution report: orderId={}, execId={}, lastQty={}, lastPx={}",
                execution.getOrderId(),
                execution.getExecId(),
                execution.getLastQty(),
                execution.getLastPx());

        Order order = loadOrder(execution.getOrderId());
        OrderTaskContext context = createContext(order, execution);
        context.setCommand(command);
        TaskPipeline<OrderTaskContext> pipeline = buildPipeline();
        PipelineResult result = orchestrator.execute(pipeline, context);

        logPipelineResult(result);

        // Without this the transaction commits whatever earlier tasks wrote. The concrete failure
        // this prevents: PersistExecutionTask succeeds, UpdateOrderTask throws, and the caller is
        // told the fill was rejected while the execution row sits committed against an order whose
        // quantities were never updated.
        if (!result.isSuccess()) {
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
            log.warn(
                    "ExecutionProcessingPipeline failed for orderId={}, execId={}, rolling back",
                    execution.getOrderId(),
                    execution.getExecId());
            // Another command changed the order first: a retry, not a refusal (SPEC-0027).
            PipelineResults.rethrowConcurrencyFailure(result);
        }

        return createResult(result, context);
    }

    /**
     * Loads the order under its row lock, as the lifecycle pipeline does (SPEC-0048): a concurrent
     * fill or lifecycle command on the same order waits for this one to commit, then applies on top,
     * instead of losing the race for the next event version and failing. The version check stays as
     * the safety net. Once order trees exist, the root order is locked first (SPEC-0022); today
     * every order is its own root.
     */
    private Order loadOrder(String orderId) {
        Order order = orderRepository
                .findLockedByOrderId(orderId)
                .orElseThrow(
                        () ->
                                new IllegalArgumentException(
                                        "Order not found for orderId: " + orderId));
        // The order as loaded, for the event's record of what this fill changes (SPEC-0049).
        LoadedOrders.remember(order);
        return order;
    }

    private OrderTaskContext createContext(Order order, Execution execution) {
        OrderTaskContext context = new OrderTaskContext(order);
        context.setExecution(execution);
        context.putMetadata("processorType", "ExecutionCommandProcessor");
        context.putMetadata("orderId", order.getOrderId());
        context.putMetadata("execId", execution.getExecId());
        return context;
    }

    private TaskPipeline<OrderTaskContext> buildPipeline() {
        return TaskPipeline.<OrderTaskContext>builder("ExecutionProcessingPipeline")
                .addTask(deduplicateCommandTask)
                .addTask(checkExpectedVersionTask)
                .addTask(validateExecutionTask)
                .addTask(calculateOrderQuantitiesTask)
                .addTask(determineOrderStateTask)
                .addTask(persistExecutionTask)
                .addTask(updateOrderTask)
                .addTask(publishExecutionEventTask)
                .addTask(projectTask)
                .sortByOrder(true)
                .stopOnFailure(true)
                .build();
    }

    private void logPipelineResult(PipelineResult result) {
        log.info(
                "Pipeline execution completed - Success: {}, Duration: {}ms, Tasks: {}, "
                        + "Succeeded: {}, Failed: {}, Skipped: {}",
                result.isSuccess(),
                result.getExecutionTime().toMillis(),
                result.getTaskResults().size(),
                result.getSuccessCount(),
                result.getFailedCount(),
                result.getSkippedCount());

        if (!result.isSuccess()) {
            result.getTaskResults()
                    .forEach(
                            taskResult -> {
                                if (taskResult.isFailed()) {
                                    log.error(
                                            "Task failed: {} - {}",
                                            taskResult.getTaskName(),
                                            taskResult.getMessage());
                                }
                            });
        }
    }

    private ExecutionProcessingResult createResult(
            PipelineResult result, OrderTaskContext context) {
        return ExecutionProcessingResult.builder()
                .success(result.isSuccess())
                .duplicate(!result.isSuccess() && PipelineResults.isDuplicate(result, context))
                .eventVersion(context.getOrDefault("eventVersion", null))
                .errorMessage(result.isSuccess() ? null : PipelineResults.refusalReason(result, context, null))
                .executionTime(result.getExecutionTime())
                .order(context.getOrder())
                .execution(context.getExecution())
                .taskResults(result.getTaskResults())
                .build();
    }

    @lombok.Builder
    @lombok.Getter
    public static class ExecutionProcessingResult {
        private final boolean success;
        /** Refused because the order already applied the command's commandId (SPEC-0046). */
        private final boolean duplicate;
        /** The version of the fill event, when applied. */
        private final Long eventVersion;
        private final String errorMessage;
        private final java.time.Duration executionTime;
        private final Order order;
        private final Execution execution;
        private final java.util.List<org.example.common.orchestration.TaskResult> taskResults;
    }
}
