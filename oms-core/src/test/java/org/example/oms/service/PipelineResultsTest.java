package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import java.util.List;

import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskOrchestrator.PipelineResult;
import org.example.common.orchestration.TaskResult;
import org.junit.jupiter.api.Test;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.OptimisticLockingFailureException;

/** SPEC-0027: a concurrency failure inside a pipeline task reaches the caller as itself. */
class PipelineResultsTest {

    @Test
    void conflictWrappedByATaskIsRethrown() {
        OptimisticLockingFailureException conflict = new OptimisticLockingFailureException("order changed");
        PipelineResult result = failedWith(new TaskExecutionException("PublishExecutionEventTask", "failed", conflict));

        assertSame(conflict, assertThrows(OptimisticLockingFailureException.class,
                () -> PipelineResults.rethrowConcurrencyFailure(result)));
    }

    // Review: a deadlock between a fill and a lifecycle command's row lock is a retry too.
    @Test
    void lockFailureWrappedByATaskIsRethrown() {
        CannotAcquireLockException deadlock = new CannotAcquireLockException("deadlock detected");
        PipelineResult result = failedWith(new TaskExecutionException("PublishOrderEventTask", "failed", deadlock));

        assertSame(deadlock, assertThrows(ConcurrencyFailureException.class,
                () -> PipelineResults.rethrowConcurrencyFailure(result)));
    }

    @Test
    void otherFailuresAreLeftToTheCaller() {
        PipelineResult result = failedWith(new TaskExecutionException("UpdateOrderTask", "exceeds orderQty"));

        assertDoesNotThrow(() -> PipelineResults.rethrowConcurrencyFailure(result));
    }

    private static PipelineResult failedWith(Exception exception) {
        return new PipelineResult(
                "test", List.of(TaskResult.failed("task", exception)), false, Duration.ZERO);
    }
}
