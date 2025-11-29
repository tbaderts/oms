package org.example.oms.model.orchestration;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.Command;
import org.example.common.orchestration.TaskContext;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;

import lombok.Getter;
import lombok.Setter;

/**
 * OMS-specific task context that extends the base TaskContext with domain objects. This context is
 * used to pass order-related state between tasks in the OMS pipeline.
 */
@Getter
@Setter
public class OrderTaskContext extends TaskContext {

    private Command command;
    private Order order;
    private Execution execution;
    private Event event;
    private OrderEvent orderEvent;
    private State newState;
    private State previousState;

    public OrderTaskContext() {
        super();
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
     * Checks if a transaction is present in the context.
     *
     * @return true if command is not null
     */
    public boolean hasCommand() {
        return command != null;
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
