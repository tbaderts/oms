package org.example.oms.model;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.TaskContext;

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
    private Object command;

    /** Error message if validation or processing fails. */
    private String errorMessage;

    /** Flag indicating whether validation passed. */
    private boolean validationPassed;

    /** The generated order ID (before persistence). */
    private String generatedOrderId;

    public OrderTaskContext() {
        super();
        this.validationPassed = true; // Default to true
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
