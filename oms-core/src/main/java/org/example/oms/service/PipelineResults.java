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
