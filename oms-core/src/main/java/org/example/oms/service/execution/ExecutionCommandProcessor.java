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
import lombok.extern.slf4j.Slf4j;

/**
 * Command processor for handling execution reports. Assembles and executes a task pipeline to
 * process order fills and update order state accordingly.
 *
 * <p>Pipeline stages:
 *
 * <ol>
 *   <li>Validate execution fields and business rules
 *   <li>Calculate order quantities (cumQty, leavesQty, avgPx)
 *   <li>Determine new order state (LIVE or FILLED)
 *   <li>Persist execution to database
 *   <li>Update order with new quantities and state
 *   <li>Publish execution event for downstream consumers
 * </ol>
 *
 * <p>The pipeline uses the Task Orchestration Framework to ensure modularity, testability, and
 * observability.
 */
@Service
@Slf4j
public class ExecutionCommandProcessor {

    private final TaskOrchestrator orchestrator;
    private final OrderRepository orderRepository;

    // Tasks (injected as Spring beans)
    private final ValidateExecutionTask validateExecutionTask;
    private final CalculateOrderQuantitiesTask calculateOrderQuantitiesTask;
    private final DetermineOrderStateTask determineOrderStateTask;
    private final PersistExecutionTask persistExecutionTask;
    private final UpdateOrderTask updateOrderTask;
    private final PublishExecutionEventTask publishExecutionEventTask;

    public ExecutionCommandProcessor(
            TaskOrchestrator orchestrator,
            OrderRepository orderRepository,
            ValidateExecutionTask validateExecutionTask,
            CalculateOrderQuantitiesTask calculateOrderQuantitiesTask,
            DetermineOrderStateTask determineOrderStateTask,
            PersistExecutionTask persistExecutionTask,
            UpdateOrderTask updateOrderTask,
            PublishExecutionEventTask publishExecutionEventTask) {
        this.orchestrator = orchestrator;
        this.orderRepository = orderRepository;
        this.validateExecutionTask = validateExecutionTask;
        this.calculateOrderQuantitiesTask = calculateOrderQuantitiesTask;
        this.determineOrderStateTask = determineOrderStateTask;
        this.persistExecutionTask = persistExecutionTask;
        this.updateOrderTask = updateOrderTask;
        this.publishExecutionEventTask = publishExecutionEventTask;
    }

    /**
     * Processes an execution report by executing the execution processing pipeline.
     *
     * @param execution the execution report
     * @return the pipeline execution result
     */
    @Transactional
    @Observed(name = "oms.execution-processor.process")
    public ExecutionProcessingResult process(Execution execution) {
        log.info(
                "Processing execution report: orderId={}, execId={}, lastQty={}, lastPx={}",
                execution.getOrderId(),
                execution.getExecID(),
                execution.getLastQty(),
                execution.getLastPx());

        // Load the order from database
        Order order = loadOrder(execution.getOrderId());

        // Create context
        OrderTaskContext context = createContext(order, execution);

        // Build the task pipeline
        TaskPipeline<OrderTaskContext> pipeline = buildPipeline();

        // Execute the pipeline
        PipelineResult result = orchestrator.execute(pipeline, context);

        // Log pipeline results
        logPipelineResult(result);

        // Return result with execution details
        return createResult(result, context);
    }

    /**
     * Loads the order from the database by orderId.
     *
     * @param orderId the order ID
     * @return the order entity
     * @throws IllegalArgumentException if order not found
     */
    private Order loadOrder(String orderId) {
        return orderRepository
                .findByOrderId(orderId)
                .orElseThrow(
                        () ->
                                new IllegalArgumentException(
                                        "Order not found for orderId: " + orderId));
    }

    /**
     * Creates the task context from the order and execution.
     *
     * @param order the order being filled
     * @param execution the execution report
     * @return the initialized context
     */
    private OrderTaskContext createContext(Order order, Execution execution) {
        OrderTaskContext context = new OrderTaskContext(order);
        context.setExecution(execution);

        // Add metadata
        context.putMetadata("processorType", "ExecutionCommandProcessor");
        context.putMetadata("orderId", order.getOrderId());
        context.putMetadata("execId", execution.getExecID());

        return context;
    }

    /**
     * Builds the execution processing task pipeline.
     *
     * @return the configured pipeline
     */
    private TaskPipeline<OrderTaskContext> buildPipeline() {
        return TaskPipeline.<OrderTaskContext>builder("ExecutionProcessingPipeline")
                .addTask(validateExecutionTask)
                .addTask(calculateOrderQuantitiesTask)
                .addTask(determineOrderStateTask)
                .addTask(persistExecutionTask)
                .addTask(updateOrderTask)
                .addTask(publishExecutionEventTask)
                .sortByOrder(true) // Execute tasks in order based on getOrder()
                .stopOnFailure(true) // Stop on first failure
                .build();
    }

    /**
     * Logs the pipeline execution results.
     *
     * @param result the pipeline result
     */
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

        // Log individual task results for debugging
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

    /**
     * Creates the result object from the pipeline result and context.
     *
     * @param result the pipeline result
     * @param context the task context
     * @return the execution processing result
     */
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

    /**
     * Result object for execution processing operation.
     */
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
