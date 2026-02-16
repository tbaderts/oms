package org.example.oms.service.execution;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.orchestration.TaskOrchestrator;
import org.example.common.orchestration.TaskOrchestrator.PipelineResult;
import org.example.common.orchestration.TaskPipeline;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.execution.tasks.CalculateOrderQuantitiesTask;
import org.example.oms.service.execution.tasks.DetermineOrderStateTask;
import org.example.oms.service.execution.tasks.PersistExecutionTask;
import org.example.oms.service.execution.tasks.PublishExecutionEventTask;
import org.example.oms.service.execution.tasks.UpdateOrderTask;
import org.example.oms.service.execution.tasks.ValidateExecutionTask;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.micrometer.observation.annotation.Observed;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Command processor for handling execution reports. Assembles and executes a task pipeline to
 * process order fills and update order state accordingly.
 *
 * <p>The execution pipeline consists of 6 ordered tasks:
 * <ol>
 *   <li>ValidateExecutionTask - Validates execution report fields</li>
 *   <li>CalculateOrderQuantitiesTask - Calculates cumQty, leavesQty</li>
 *   <li>DetermineOrderStateTask - Determines new order state</li>
 *   <li>PersistExecutionTask - Saves execution to database</li>
 *   <li>UpdateOrderTask - Updates order with new quantities and state</li>
 *   <li>PublishExecutionEventTask - Publishes event to outbox</li>
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
    private final CalculateOrderQuantitiesTask calculateOrderQuantitiesTask;
    private final DetermineOrderStateTask determineOrderStateTask;
    private final PersistExecutionTask persistExecutionTask;
    private final UpdateOrderTask updateOrderTask;
    private final PublishExecutionEventTask publishExecutionEventTask;

    @Transactional
    @Observed(name = "oms.execution-processor.process")
    public ExecutionProcessingResult process(Execution execution) {
        log.info(
                "Processing execution report: orderId={}, execId={}, lastQty={}, lastPx={}",
                execution.getOrderId(),
                execution.getExecID(),
                execution.getLastQty(),
                execution.getLastPx());

        Order order = loadOrder(execution.getOrderId());
        OrderTaskContext context = createContext(order, execution);
        TaskPipeline<OrderTaskContext> pipeline = buildPipeline();
        PipelineResult result = orchestrator.execute(pipeline, context);

        logPipelineResult(result);
        return createResult(result, context);
    }

    private Order loadOrder(String orderId) {
        return orderRepository
                .findByOrderId(orderId)
                .orElseThrow(
                        () ->
                                new IllegalArgumentException(
                                        "Order not found for orderId: " + orderId));
    }

    private OrderTaskContext createContext(Order order, Execution execution) {
        OrderTaskContext context = new OrderTaskContext(order);
        context.setExecution(execution);
        context.putMetadata("processorType", "ExecutionCommandProcessor");
        context.putMetadata("orderId", order.getOrderId());
        context.putMetadata("execId", execution.getExecID());
        return context;
    }

    private TaskPipeline<OrderTaskContext> buildPipeline() {
        return TaskPipeline.<OrderTaskContext>builder("ExecutionProcessingPipeline")
                .addTask(validateExecutionTask)
                .addTask(calculateOrderQuantitiesTask)
                .addTask(determineOrderStateTask)
                .addTask(persistExecutionTask)
                .addTask(updateOrderTask)
                .addTask(publishExecutionEventTask)
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
        private final java.time.Duration executionTime;
        private final Order order;
        private final Execution execution;
        private final java.util.List<org.example.common.orchestration.TaskResult> taskResults;
    }
}
