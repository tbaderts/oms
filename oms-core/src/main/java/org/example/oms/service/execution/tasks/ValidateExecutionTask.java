package org.example.oms.service.execution.tasks;

import java.math.BigDecimal;

import org.example.common.model.Execution;
import org.example.common.model.Order;
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
 *   <li>Required fields: orderId, execId, lastQty, lastPx
 *   <li>LastQty must be positive
 *   <li>LastPx must be positive
 *   <li>An instrument (symbol or securityId) that does not contradict the order's (SPEC-0069)
 *   <li>Order must be in LIVE state
 * </ul>
 *
 * @see <a href="file:///oms-knowledge-base/framework/validation-engine.md">Validation Rules - Execution Validation Patterns</a>
 * @see <a href="file:///oms-knowledge-base/domain/concepts/execution-reporting.md">Execution Reporting - Execution Pipeline</a>
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

        if (execution.getExecId() == null || execution.getExecId().isEmpty()) {
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

        // Validate the instrument the fill reports (SPEC-0069)
        String instrumentProblem = instrumentProblem(execution, context.getOrder());
        if (instrumentProblem != null) {
            return TaskResult.failed(getName(), instrumentProblem);
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
                execution.getExecId(),
                execution.getLastQty(),
                execution.getLastPx());

        return TaskResult.success(getName(), "Execution validation passed");
    }

    /**
     * The FIX Instrument block of the fill (SPEC-0069): it must name the instrument, by symbol or
     * securityId, and not one other than its order's. Each field is compared only when both the
     * fill and the order have it; without symbology mapping a securityId cannot be checked against a
     * symbol. Returns the refusal reason, or null when the instrument is acceptable.
     */
    private static String instrumentProblem(Execution execution, Order order) {
        String symbol = blankToNull(execution.getSymbol());
        String securityId = blankToNull(execution.getSecurityId());
        if (symbol == null && securityId == null) {
            return "Instrument is required: the fill carries neither symbol nor securityId";
        }
        // Kafka has no minLength check; a blank value next to a real one would be stored as whitespace.
        if (symbol == null && execution.getSymbol() != null) {
            return "Fill symbol must not be blank";
        }
        if (securityId == null && execution.getSecurityId() != null) {
            return "Fill securityId must not be blank";
        }
        String orderSymbol = blankToNull(order.getSymbol());
        if (symbol != null && orderSymbol != null && !symbol.equals(orderSymbol)) {
            return String.format("Fill symbol %s does not match the order's symbol %s", symbol, orderSymbol);
        }
        String orderSecurityId = blankToNull(order.getSecurityId());
        if (securityId != null && orderSecurityId != null && !securityId.equals(orderSecurityId)) {
            return String.format(
                    "Fill securityId %s does not match the order's securityId %s", securityId, orderSecurityId);
        }
        return null;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    @Override
    public int getOrder() {
        return 100; // Execute early in the pipeline
    }
}
