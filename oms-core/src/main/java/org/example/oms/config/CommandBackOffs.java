package org.example.oms.config;

import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.util.backoff.BackOff;
import org.springframework.util.backoff.ExponentialBackOff;

/**
 * How a failed command is retried on the Kafka listener (SPEC-0048).
 *
 * <p>A concurrency failure (a lost race for the order's next version, a lock timeout or a deadlock)
 * is not a fault of the record: it ends as soon as the competing command commits. It cannot be a
 * poison message, so it is retried with capped back-off for as long as it takes and never uses up
 * the retry budget that sends other failures to the dead-letter topic.
 */
final class CommandBackOffs {

    private CommandBackOffs() {}

    /** Whether the failure, wherever the container wrapped it, is a concurrency failure. */
    static boolean isConcurrencyFailure(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConcurrencyFailureException) {
                return true;
            }
            if (cause.getCause() == cause) {
                return false;
            }
        }
        return false;
    }

    /** Exponential back-off capped at {@code maxIntervalMs}, with no limit on attempts. */
    static BackOff concurrencyBackOff(long initialIntervalMs, long maxIntervalMs) {
        ExponentialBackOff backOff = new ExponentialBackOff(Math.min(initialIntervalMs, maxIntervalMs), 2.0);
        backOff.setMaxInterval(maxIntervalMs);
        return backOff;
    }

    /**
     * The back-off for this failure: the unbounded one for a concurrency failure, otherwise null,
     * which tells the error handler to use its bounded default.
     */
    static BackOff backOffFor(Exception failure, BackOff concurrency) {
        return isConcurrencyFailure(failure) ? concurrency : null;
    }
}
