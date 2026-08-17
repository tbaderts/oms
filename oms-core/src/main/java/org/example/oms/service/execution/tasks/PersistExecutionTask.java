package org.example.oms.service.execution.tasks;

import java.util.function.Predicate;

import org.example.common.model.Execution;
import org.example.common.orchestration.ConditionalTask;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.ExecutionRepository;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that persists the execution report to the database.
 * 
 * <p>This task only executes if an execution is present in the context. The execution entity is
 * saved to the executions table with all fill details (lastQty, lastPx, cumQty, etc.).
 * 
 * <p>Precondition: Execution must be present in context
 */
@Component
@Slf4j
public class PersistExecutionTask implements ConditionalTask<OrderTaskContext> {

    private final ExecutionRepository executionRepository;

    public PersistExecutionTask(ExecutionRepository executionRepository) {
        this.executionRepository = executionRepository;
    }

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        log.debug("Persisting execution for context: {}", context.getContextId());

        Execution execution = context.getExecution();

        try {
            // Kafka delivery is at-least-once, so the same fill can arrive more than once. Applying
            // it twice would double-count cumQty and could drive the order to FILLED on half its
            // real volume, so a redelivery is rejected here rather than reprocessed.
            if (executionRepository.existsByOrderIdAndExecID(
                    execution.getOrderId(), execution.getExecID())) {
                String message =
                        String.format(
                                "Execution already applied: orderId=%s, execId=%s",
                                execution.getOrderId(), execution.getExecID());
                context.markValidationFailed(message);
                log.info("Idempotence check rejected duplicate execution: {}", message);
                return TaskResult.failed(getName(), message);
            }

            // Record the order's resulting position on the execution itself, the way a FIX
            // ExecutionReport carries CumQty(14) and LeavesQty(151). This makes the execution row
            // self-contained: consumers of the executions topic can render a fill without joining
            // against the orders topic, and the audit record stands on its own.
            if (context.getCalculatedCumQty() != null && context.getCalculatedLeavesQty() != null) {
                execution =
                        execution.toBuilder()
                                .cumQty(context.getCalculatedCumQty())
                                .leavesQty(context.getCalculatedLeavesQty())
                                .build();
                context.setExecution(execution);
            }

            // Persist execution to database
            Execution savedExecution = executionRepository.save(execution);

            log.info(
                    "Execution persisted successfully - execId={}, orderId={}, lastQty={}, lastPx={}",
                    savedExecution.getExecID(),
                    savedExecution.getOrderId(),
                    savedExecution.getLastQty(),
                    savedExecution.getLastPx());

            // Update context with persisted execution (with generated ID)
            context.setExecution(savedExecution);

            return TaskResult.success(
                    getName(),
                    String.format("Execution persisted with id=%d", savedExecution.getId()));

        } catch (Exception e) {
            log.error("Failed to persist execution: {}", execution, e);
            throw new TaskExecutionException(getName(), "Failed to persist execution", e);
        }
    }

    @Override
    public Predicate<OrderTaskContext> getPrecondition() {
        return OrderTaskContext::hasExecution;
    }

    @Override
    public String getSkipReason(OrderTaskContext context) {
        return "No execution present in context";
    }

    @Override
    public int getOrder() {
        return 400; // Execute after state determination
    }
}
