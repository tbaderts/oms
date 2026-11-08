package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.List;

import org.example.common.orchestration.TaskExecutionException;
import org.example.common.orchestration.TaskOrchestrator.PipelineResult;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
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

    /** SPEC-0046: the dedup lookup marks the context; the constraint race arrives as an exception. */
    @Test
    void duplicateIsSeenOnTheContextOrInTheCauseChain() {
        OrderTaskContext marked = new OrderTaskContext();
        marked.markDuplicate("Duplicate command C-1 for order ORD-1");
        assertTrue(marked.isDuplicateCommand());
        assertFalse(marked.isValid(), "a duplicate is also a validation failure");
        PipelineResult refused = new PipelineResult(
                "test", List.of(TaskResult.failed("DeduplicateCommandTask", "dup")), false, Duration.ZERO);
        assertTrue(PipelineResults.isDuplicate(refused, marked));

        PipelineResult raced = failedWith(new TaskExecutionException(
                "PublishExecutionEventTask", "failed", new DuplicateCommandException("ORD-1", "C-1")));
        assertTrue(PipelineResults.isDuplicate(raced, new OrderTaskContext()));

        PipelineResult other = failedWith(new TaskExecutionException("UpdateOrderTask", "exceeds orderQty"));
        assertFalse(PipelineResults.isDuplicate(other, new OrderTaskContext()));
    }

    private static PipelineResult failedWith(Exception exception) {
        return new PipelineResult(
                "test", List.of(TaskResult.failed("task", exception)), false, Duration.ZERO);
    }
}
