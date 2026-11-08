package org.example.oms.model;

import java.math.BigDecimal;
import java.time.Instant;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.Command;
import org.example.common.orchestration.TaskContext;
import org.example.oms.service.lifecycle.LifecycleAction;

import lombok.Getter;
import lombok.Setter;

/**
 * Domain-specific task context for order processing operations. Extends {@link TaskContext} to
 * provide type-safe access to order-related state throughout the task pipeline.
 *
 * <p>This context carries the order being processed and additional metadata needed by various tasks
 * in the order creation pipeline.
 */
@Getter
@Setter
public class OrderTaskContext extends TaskContext {

    /** The order being processed. */
    private Order order;

    /** The execution being processed (for execution reports). */
    private Execution execution;

    /** The target state for the order (e.g., UNACK, LIVE). */
    private State targetState;

    /** The command that triggered this processing. */
    private Command command;

    /**
     * When the triggering command crossed the OMS boundary.
     *
     * <p>Captured by the controller or the Kafka listener and carried down, rather than read from
     * the clock inside a task — by then the latency being measured has already been incurred.
     */
    private Instant receivedTime;

    /** Error message if validation or processing fails. */
    private String errorMessage;

    /** Flag indicating whether validation passed. */
    private boolean validationPassed;

    /** The generated order ID (before persistence). */
    private String generatedOrderId;

    /** Calculated cumulative quantity from execution processing. */
    private BigDecimal calculatedCumQty;

    /** Calculated leaves quantity from execution processing. */
    private BigDecimal calculatedLeavesQty;

    /** Calculated average price of the order's fills, including this one (SPEC-0041). */
    private BigDecimal calculatedAvgPx;

    /** The new order state determined by execution processing. */
    private State newOrderState;

    /**
     * The event to record for this change. Unset means the pipeline creates an order, so the
     * publish task falls back to {@link Event#NEW_ORDER}.
     */
    private Event event;

    /** The lifecycle action (reject, cancel, cancel request, cancel reject) being applied. */
    private LifecycleAction lifecycleAction;

    /** Whether the command was refused because the order already applied its commandId (SPEC-0046). */
    private boolean duplicateCommand;

    public OrderTaskContext() {
        super();
        this.validationPassed = true;
    }

    /**
     * Creates a context with an initial order.
     *
     * @param order the order to process
     */
    public OrderTaskContext(Order order) {
        super();
        this.order = order;
        this.validationPassed = true;
    }

    /**
     * Marks the context as having a validation failure.
     *
     * @param errorMessage the validation error message
     */
    public void markValidationFailed(String errorMessage) {
        this.validationPassed = false;
        this.errorMessage = errorMessage;
    }

    /**
     * Marks the command as a duplicate: its commandId was already applied to the order (SPEC-0046).
     * A duplicate is a validation failure too, so the pipeline stops and nothing is written.
     */
    public void markDuplicate(String errorMessage) {
        markValidationFailed(errorMessage);
        this.duplicateCommand = true;
    }

    /**
     * Checks if the context is in a valid state for processing.
     *
     * @return true if validation passed and no errors occurred
     */
    public boolean isValid() {
        return validationPassed && errorMessage == null;
    }

    /**
     * Checks if an order is present in the context.
     *
     * @return true if order is not null
     */
    public boolean hasOrder() {
        return order != null;
    }

    /**
     * Checks if an execution is present in the context.
     *
     * @return true if execution is not null
     */
    public boolean hasExecution() {
        return execution != null;
    }
}
