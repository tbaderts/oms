package org.example.common.orchestration;

import java.util.function.Predicate;

/**
 * A task that includes a precondition check before execution. The task will only execute if the
 * precondition evaluates to true.
 *
 * @param <T> the type of the TaskContext used by this task
 */
public interface ConditionalTask<T extends TaskContext> extends Task<T> {

    /**
     * Returns the precondition predicate that determines whether this task should execute. If the
     * predicate returns false, the task will be skipped.
     *
     * @return the precondition predicate
     */
    Predicate<T> getPrecondition();

    /**
     * Checks if the task should execute based on the current context.
     *
     * @param context the task context
     * @return true if the task should execute, false if it should be skipped
     */
    default boolean shouldExecute(T context) {
        Predicate<T> precondition = getPrecondition();
        return precondition == null || precondition.test(context);
    }

    /**
     * Returns a message explaining why the task was skipped. Override to provide custom skip
     * reasons.
     *
     * @param context the task context
     * @return the skip reason message
     */
    default String getSkipReason(T context) {
        return "Precondition not met";
    }
}
