package org.example.oms.service;

import org.example.common.orchestration.TaskOrchestrator.PipelineResult;
import org.example.common.orchestration.TaskResult;
import org.springframework.dao.ConcurrencyFailureException;

/** Helpers for the command processors that run a task pipeline. */
public final class PipelineResults {

    private PipelineResults() {}

    /**
     * Rethrows a concurrency failure that a task failed with, wherever it sits in the task's cause
     * chain (tasks wrap their failures in {@code TaskExecutionException}).
     *
     * <p>Any Spring {@link ConcurrencyFailureException} counts: an optimistic conflict (another command
     * appended the order's next version first) and a lock failure or deadlock with another command.
     * It is not a business refusal; retrying the command can succeed. Thrown, it rolls the command
     * back and makes the caller retry (Kafka) or answer 409 (REST). Returned as a failed result, a
     * Kafka command would be acknowledged and lost. Since SPEC-0027 these surface inside the
     * pipeline, where the event is appended and flushed.
     */
    /**
     * Whether a failed pipeline refused its command as a duplicate (SPEC-0046): either the dedup
     * lookup marked the context, or the unique {@code (order_id, command_id)} caught a race the
     * lookup could not see, which the appender raises as {@link DuplicateCommandException} and a
     * task wraps.
     */
    public static boolean isDuplicate(PipelineResult result, org.example.oms.model.OrderTaskContext context) {
        if (context != null && context.isDuplicateCommand()) {
            return true;
        }
        for (TaskResult taskResult : result.getTaskResults()) {
            for (Throwable cause = taskResult.getException().orElse(null); cause != null; cause = cause.getCause()) {
                if (cause instanceof DuplicateCommandException) {
                    return true;
                }
                if (cause.getCause() == cause) {
                    break;
                }
            }
        }
        return false;
    }

    /**
     * Why a failed pipeline refused its command: the reason a task marked on the context, or, for a
     * duplicate the unique constraint caught, the duplicate's own message rather than the generic
     * failure of the task that hit it; else the first failed task's message.
     */
    public static String refusalReason(PipelineResult result, org.example.oms.model.OrderTaskContext context, String fallback) {
        if (context != null && context.getErrorMessage() != null) {
            return context.getErrorMessage();
        }
        for (TaskResult taskResult : result.getTaskResults()) {
            for (Throwable cause = taskResult.getException().orElse(null); cause != null; cause = cause.getCause()) {
                if (cause instanceof DuplicateCommandException duplicate) {
                    return duplicate.getMessage();
                }
                if (cause.getCause() == cause) {
                    break;
                }
            }
        }
        return result.getTaskResults().stream()
                .filter(TaskResult::isFailed)
                .map(TaskResult::getMessage)
                .findFirst()
                .orElse(fallback);
    }

    public static void rethrowConcurrencyFailure(PipelineResult result) {
        for (TaskResult taskResult : result.getTaskResults()) {
            if (!taskResult.isFailed()) {
                continue;
            }
            for (Throwable cause = taskResult.getException().orElse(null); cause != null; cause = cause.getCause()) {
                if (cause instanceof ConcurrencyFailureException failure) {
                    throw failure;
                }
                if (cause.getCause() == cause) {
                    break;
                }
            }
        }
    }
}
