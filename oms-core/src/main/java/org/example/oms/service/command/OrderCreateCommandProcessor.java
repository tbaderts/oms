package org.example.oms.service.command;

import org.example.common.model.Order;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.orchestration.TaskOrchestrator;
import org.example.common.orchestration.TaskOrchestrator.PipelineResult;
import org.example.common.orchestration.TaskPipeline;
import org.example.oms.mapper.OrderMapper;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.service.command.tasks.AssignOrderIdTask;
import org.example.oms.service.command.tasks.PersistOrderTask;
import org.example.oms.service.command.tasks.PublishOrderEventTask;
import org.example.oms.service.command.tasks.SetOrderStateTask;
import org.example.oms.service.command.tasks.ValidateOrderTask;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.micrometer.observation.annotation.Observed;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Command processor for handling OrderCreateCmd. Assembles and executes a task pipeline to process
 * new order creation requests.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderCreateCommandProcessor {

    private final TaskOrchestrator orchestrator;
    private final OrderMapper orderMapper;
    private final ValidateOrderTask validateOrderTask;
    private final AssignOrderIdTask assignOrderIdTask;
    private final SetOrderStateTask setOrderStateTask;
    private final PersistOrderTask persistOrderTask;
    private final PublishOrderEventTask publishOrderEventTask;

    @Transactional
    @Observed(name = "oms.order-create-processor.process")
    public OrderCreateResult process(OrderCreateCmd command) {
        log.info("Processing OrderCreateCmd: {}", command.getOrder().getClOrdId());

        OrderTaskContext context = createContext(command);
        TaskPipeline<OrderTaskContext> pipeline = buildPipeline();
        PipelineResult result = orchestrator.execute(pipeline, context);

        logPipelineResult(result);
        return createResult(result, context);
    }

    private OrderTaskContext createContext(OrderCreateCmd command) {
        Order order = orderMapper.toOrder(command.getOrder());
        OrderTaskContext context = new OrderTaskContext(order);
        context.setCommand(command);
        context.putMetadata("commandType", "OrderCreateCmd");
        context.putMetadata("commandVersion", command.getVersion());
        return context;
    }

    private TaskPipeline<OrderTaskContext> buildPipeline() {
        return TaskPipeline.<OrderTaskContext>builder("OrderCreationPipeline")
                .addTask(validateOrderTask)
                .addTask(assignOrderIdTask)
                .addTask(setOrderStateTask)
                .addTask(persistOrderTask)
                .addTask(publishOrderEventTask)
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

        result.getTaskResults()
                .forEach(
                        taskResult ->
                                log.debug(
                                        "Task: {}, Status: {}, Message: {}",
                                        taskResult.getTaskName(),
                                        taskResult.getStatus(),
                                        taskResult.getMessage()));
    }

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
