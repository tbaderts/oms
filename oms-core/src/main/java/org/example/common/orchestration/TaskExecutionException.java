package org.example.common.orchestration;

/**
 * Exception thrown when a task execution fails. Can be used to wrap underlying exceptions or signal
 * task-specific failures.
 */
public class TaskExecutionException extends Exception {

    private final String taskName;

    public TaskExecutionException(String taskName, String message) {
        super(String.format("Task '%s' failed: %s", taskName, message));
        this.taskName = taskName;
    }

    public TaskExecutionException(String taskName, String message, Throwable cause) {
        super(String.format("Task '%s' failed: %s", taskName, message), cause);
        this.taskName = taskName;
    }

    public TaskExecutionException(String taskName, Throwable cause) {
        super(String.format("Task '%s' failed: %s", taskName, cause.getMessage()), cause);
        this.taskName = taskName;
    }

    public String getTaskName() {
        return taskName;
    }
}
