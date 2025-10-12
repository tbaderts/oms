package org.example.common.orchestration;

/**
 * Represents a unit of work in a task orchestration pipeline. Tasks are Spring-managed beans that
 * can be composed into pipelines for complex business logic. Each task receives a {@link
 * TaskContext} containing shared state and produces a {@link TaskResult}.
 *
 * @param <T> the type of the TaskContext used by this task
 */
public interface Task<T extends TaskContext> {

    /**
     * Executes the task logic.
     *
     * @param context the task context containing shared state and configuration
     * @return the result of the task execution
     * @throws TaskExecutionException if the task execution fails
     */
    TaskResult execute(T context) throws TaskExecutionException;

    /**
     * Returns the name of this task for logging and debugging purposes.
     *
     * @return the task name
     */
    default String getName() {
        return this.getClass().getSimpleName();
    }

    /**
     * Determines the order/priority of this task when multiple tasks are registered. Lower values
     * execute first.
     *
     * @return the execution order priority (default: 0)
     */
    default int getOrder() {
        return 0;
    }
}
