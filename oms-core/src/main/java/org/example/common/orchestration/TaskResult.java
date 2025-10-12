package org.example.common.orchestration;

import java.util.List;
import java.util.Optional;

import lombok.Builder;
import lombok.Getter;
import lombok.Singular;

/**
 * Represents the result of a task execution. Contains status information, optional messages, and
 * details about execution.
 */
@Getter
@Builder
public class TaskResult {

    /** Status of the task execution. */
    public enum Status {
        /** Task completed successfully */
        SUCCESS,
        /** Task was skipped due to precondition */
        SKIPPED,
        /** Task failed with an error */
        FAILED,
        /** Task execution was partially successful with warnings */
        WARNING
    }

    private final Status status;
    private final String message;
    private final String taskName;

    @Singular private final List<String> warnings;

    @Singular private final List<String> errors;

    private final Exception exception;

    /**
     * Creates a successful result.
     *
     * @param taskName the name of the task
     * @return a success result
     */
    public static TaskResult success(String taskName) {
        return TaskResult.builder().status(Status.SUCCESS).taskName(taskName).build();
    }

    /**
     * Creates a successful result with a message.
     *
     * @param taskName the name of the task
     * @param message the success message
     * @return a success result
     */
    public static TaskResult success(String taskName, String message) {
        return TaskResult.builder()
                .status(Status.SUCCESS)
                .taskName(taskName)
                .message(message)
                .build();
    }

    /**
     * Creates a skipped result.
     *
     * @param taskName the name of the task
     * @param reason the reason for skipping
     * @return a skipped result
     */
    public static TaskResult skipped(String taskName, String reason) {
        return TaskResult.builder()
                .status(Status.SKIPPED)
                .taskName(taskName)
                .message(reason)
                .build();
    }

    /**
     * Creates a failed result.
     *
     * @param taskName the name of the task
     * @param message the failure message
     * @return a failed result
     */
    public static TaskResult failed(String taskName, String message) {
        return TaskResult.builder()
                .status(Status.FAILED)
                .taskName(taskName)
                .message(message)
                .error(message)
                .build();
    }

    /**
     * Creates a failed result with an exception.
     *
     * @param taskName the name of the task
     * @param exception the exception that caused the failure
     * @return a failed result
     */
    public static TaskResult failed(String taskName, Exception exception) {
        return TaskResult.builder()
                .status(Status.FAILED)
                .taskName(taskName)
                .message(exception.getMessage())
                .exception(exception)
                .error(exception.getMessage())
                .build();
    }

    /**
     * Creates a warning result.
     *
     * @param taskName the name of the task
     * @param message the warning message
     * @return a warning result
     */
    public static TaskResult warning(String taskName, String message) {
        return TaskResult.builder()
                .status(Status.WARNING)
                .taskName(taskName)
                .message(message)
                .warning(message)
                .build();
    }

    /**
     * Checks if the task execution was successful.
     *
     * @return true if status is SUCCESS
     */
    public boolean isSuccess() {
        return status == Status.SUCCESS;
    }

    /**
     * Checks if the task was skipped.
     *
     * @return true if status is SKIPPED
     */
    public boolean isSkipped() {
        return status == Status.SKIPPED;
    }

    /**
     * Checks if the task failed.
     *
     * @return true if status is FAILED
     */
    public boolean isFailed() {
        return status == Status.FAILED;
    }

    /**
     * Gets the exception if present.
     *
     * @return Optional containing the exception
     */
    public Optional<Exception> getException() {
        return Optional.ofNullable(exception);
    }

    @Override
    public String toString() {
        return String.format(
                "TaskResult[status=%s, task=%s, message=%s, warnings=%d, errors=%d]",
                status,
                taskName,
                message,
                warnings != null ? warnings.size() : 0,
                errors != null ? errors.size() : 0);
    }
}
