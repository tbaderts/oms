package org.example.oms.service.command;

import org.example.common.model.Order;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.mapper.OrderMapper;
import org.example.common.orchestration.TaskOrchestrator;
import org.example.common.orchestration.TaskOrchestrator.PipelineResult;
import org.example.common.orchestration.TaskPipeline;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.service.command.tasks.AssignOrderIdTask;
import org.example.oms.service.command.tasks.PersistOrderTask;
import org.example.oms.service.command.tasks.PublishOrderEventTask;
import org.example.oms.service.command.tasks.SetOrderStateTask;
import org.example.oms.service.command.tasks.ValidateOrderTask;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.micrometer.observation.annotation.Observed;
import lombok.extern.slf4j.Slf4j;

/**
 * Command processor for handling OrderCreateCmd. Assembles and executes a task pipeline to process
 * new order creation requests.
 *
 * <p>Pipeline stages:
 *
 * <ol>
 *   <li>Validate order fields and business rules
 *   <li>Assign unique order ID
 *   <li>Set initial order state (UNACK) and timestamps
 *   <li>Persist order to database
 *   <li>Publish order creation event
 * </ol>
 *
 * <p>The pipeline uses the Task Orchestration Framework to ensure modularity, testability, and
 * observability.
 */
@Service
@Slf4j
public class OrderCreateCommandProcessor {

    private final TaskOrchestrator orchestrator;
    private final OrderMapper orderMapper;

    // Tasks (injected as Spring beans)
    private final ValidateOrderTask validateOrderTask;
    private final AssignOrderIdTask assignOrderIdTask;
    private final SetOrderStateTask setOrderStateTask;
    private final PersistOrderTask persistOrderTask;
    private final PublishOrderEventTask publishOrderEventTask;

    public OrderCreateCommandProcessor(
            TaskOrchestrator orchestrator,
            OrderMapper orderMapper,
            ValidateOrderTask validateOrderTask,
            AssignOrderIdTask assignOrderIdTask,
            SetOrderStateTask setOrderStateTask,
            PersistOrderTask persistOrderTask,
            PublishOrderEventTask publishOrderEventTask) {
        this.orchestrator = orchestrator;
        this.orderMapper = orderMapper;
        this.validateOrderTask = validateOrderTask;
        this.assignOrderIdTask = assignOrderIdTask;
        this.setOrderStateTask = setOrderStateTask;
        this.persistOrderTask = persistOrderTask;
        this.publishOrderEventTask = publishOrderEventTask;
    }

    /**
     * Processes an OrderCreateCmd by executing the order creation pipeline.
     *
     * @param command the order creation command
     * @return the pipeline execution result
     */
    @Transactional
    @Observed(name = "oms.order-create-processor.process")
    public OrderCreateResult process(OrderCreateCmd command) {
        log.info("Processing OrderCreateCmd: {}", command.getOrder().getClOrdId());

        // Create context and map command to domain order
        OrderTaskContext context = createContext(command);

        // Build the task pipeline
        TaskPipeline<OrderTaskContext> pipeline = buildPipeline();

        // Execute the pipeline
        PipelineResult result = orchestrator.execute(pipeline, context);

        // Log pipeline results
        logPipelineResult(result);

        // Return result with order details
        return createResult(result, context);
    }

    /**
     * Creates the task context from the command.
     *
     * @param command the order creation command
     * @return the initialized context
     */
    private OrderTaskContext createContext(OrderCreateCmd command) {
        // Map command order to domain order
        Order order = orderMapper.toOrder(command.getOrder());

        // Create context
        OrderTaskContext context = new OrderTaskContext(order);
        context.setCommand(command);

        // Add metadata
        context.putMetadata("commandType", "OrderCreateCmd");
        context.putMetadata("commandVersion", command.getVersion());

        return context;
    }

    /**
     * Builds the order creation task pipeline.
     *
     * @return the configured pipeline
     */
    private TaskPipeline<OrderTaskContext> buildPipeline() {
        return TaskPipeline.<OrderTaskContext>builder("OrderCreationPipeline")
                .addTask(validateOrderTask)
                .addTask(assignOrderIdTask)
                .addTask(setOrderStateTask)
                .addTask(persistOrderTask)
                .addTask(publishOrderEventTask)
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
        result.getTaskResults()
                .forEach(
                        taskResult ->
                                log.debug(
                                        "Task: {}, Status: {}, Message: {}",
                                        taskResult.getTaskName(),
                                        taskResult.getStatus(),
                                        taskResult.getMessage()));
    }

    /**
     * Creates the command processing result.
     *
     * @param pipelineResult the pipeline execution result
     * @param context the task context
     * @return the order creation result
     */
    private OrderCreateResult createResult(
            PipelineResult pipelineResult, OrderTaskContext context) {
        return OrderCreateResult.builder()
                .success(pipelineResult.isSuccess())
                .order(context.getOrder())
                .orderId(context.getOrder() != null ? context.getOrder().getOrderId() : null)
                .errorMessage(context.getErrorMessage())
                .executionTimeMs(pipelineResult.getExecutionTime().toMillis())
                .tasksExecuted(pipelineResult.getTaskResults().size())
                .tasksSucceeded((int) pipelineResult.getSuccessCount())
                .tasksFailed((int) pipelineResult.getFailedCount())
                .tasksSkipped((int) pipelineResult.getSkippedCount())
                .build();
    }

    /** Result of order creation processing. */
    @lombok.Builder
    @lombok.Getter
    public static class OrderCreateResult {
        private final boolean success;
        private final Order order;
        private final String orderId;
        private final String errorMessage;
        private final long executionTimeMs;
        private final int tasksExecuted;
        private final int tasksSucceeded;
        private final int tasksFailed;
        private final int tasksSkipped;
    }
}
