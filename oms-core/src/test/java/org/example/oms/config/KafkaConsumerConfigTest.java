package org.example.oms.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.kafka.listener.ListenerExecutionFailedException;
import org.springframework.util.backoff.BackOff;
import org.springframework.util.backoff.BackOffExecution;

/**
 * SPEC-0048 AC-2: a concurrency failure is retried with capped back-off and never runs out of
 * attempts, so it cannot reach the dead-letter topic; every other failure keeps the bounded budget.
 */
class KafkaConsumerConfigTest {

    private final BackOff concurrency = CommandBackOffs.concurrencyBackOff(500, 5_000);

    @Test
    void concurrencyFailureHasUnboundedBackOff() {
        Exception wrapped = new ListenerExecutionFailedException(
                "listener failed", new OptimisticLockingFailureException("order changed"));

        assertTrue(CommandBackOffs.isConcurrencyFailure(wrapped));
        assertTrue(CommandBackOffs.isConcurrencyFailure(new CannotAcquireLockException("deadlock detected")));
        assertSame(concurrency, CommandBackOffs.backOffFor(wrapped, concurrency));

        BackOffExecution execution = concurrency.start();
        for (int attempt = 0; attempt < 500; attempt++) {
            long interval = execution.nextBackOff();
            assertNotEquals(BackOffExecution.STOP, interval, "never stops, attempt " + attempt);
            assertTrue(interval <= 5_000, "capped at 5 s: " + interval);
        }
    }

    @Test
    void otherFailuresKeepTheBudget() {
        Exception other = new ListenerExecutionFailedException("listener failed", new IllegalStateException("database down"));

        assertFalse(CommandBackOffs.isConcurrencyFailure(other));
        assertNull(CommandBackOffs.backOffFor(other, concurrency), "null: the handler's bounded default applies");
    }
}
