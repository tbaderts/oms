package org.example.oms.service.execution.tasks;

import java.math.BigDecimal;

import org.example.common.model.Execution;
import org.example.common.model.State;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Task that validates execution fields and business rules before processing an execution report.
 *
 * <p>Validation rules:
 *
 * <ul>
 *   <li>Execution must be present in context
 *   <li>Order must be present in context
 *   <li>Required fields: orderId, execID, lastQty, lastPx
 *   <li>LastQty must be positive
 *   <li>LastPx must be positive
 *   <li>Order must be in LIVE state
 * </ul>
 *
 * @see <a href="file:///oms-knowledge-base/oms-framework/validation-rules.md">Validation Rules - Execution Validation Patterns</a>
 * @see <a href="file:///oms-knowledge-base/oms-concepts/execution-reporting.md">Execution Reporting - Execution Pipeline</a>
 */
@Component
@Slf4j
public class ValidateExecutionTask implements Task<OrderTaskContext> {

    @Override
    public TaskResult execute(OrderTaskContext context) throws TaskExecutionException {
        log.debug("Validating execution in context: {}", context.getContextId());

        // Validate context has required objects
        if (!context.hasExecution()) {
            return TaskResult.failed(getName(), "Execution is required in context");
        }

        if (!context.hasOrder()) {
            return TaskResult.failed(getName(), "Order is required in context");
        }

        Execution execution = context.getExecution();

        // Validate required fields
        if (execution.getOrderId() == null || execution.getOrderId().isEmpty()) {
            return TaskResult.failed(getName(), "OrderId is required");
        }

        if (execution.getExecID() == null || execution.getExecID().isEmpty()) {
            return TaskResult.failed(getName(), "ExecID is required");
        }

        if (execution.getLastQty() == null) {
            return TaskResult.failed(getName(), "LastQty is required");
        }

        if (execution.getLastPx() == null) {
            return TaskResult.failed(getName(), "LastPx is required");
        }

        // Validate field values
        if (execution.getLastQty().compareTo(BigDecimal.ZERO) <= 0) {
            return TaskResult.failed(
                    getName(), "LastQty must be positive, got: " + execution.getLastQty());
        }

        if (execution.getLastPx().compareTo(BigDecimal.ZERO) <= 0) {
            return TaskResult.failed(
                    getName(), "LastPx must be positive, got: " + execution.getLastPx());
        }

        // Validate order state - must be executable
        State orderState = context.getOrder().getState();
        if (orderState != State.LIVE) {
            return TaskResult.failed(
                    getName(),
                    String.format(
                            "Order must be in LIVE state for execution, current state: %s",
                            orderState));
        }

        log.debug(
                "Execution validation passed for orderId={}, execId={}, lastQty={}, lastPx={}",
                execution.getOrderId(),
                execution.getExecID(),
                execution.getLastQty(),
                execution.getLastPx());

        return TaskResult.success(getName(), "Execution validation passed");
    }

    @Override
    public int getOrder() {
        return 100; // Execute early in the pipeline
    }
}
