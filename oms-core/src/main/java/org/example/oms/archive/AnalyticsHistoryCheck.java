package org.example.oms.archive;

/**
 * Whether post-trade analytics holds an order's full history (SPEC-0052).
 *
 * <p>The requester's rule is that analytics holds an order's history before the OMS archives it.
 * Post-trade analytics is only planned, so nothing implements this yet, and the rule is switched off
 * ({@code oms.retention.require-analytics=false}). Once analytics exists, a bean implementing this
 * and the setting turned on make archiving wait for its confirmation, with no archiver change.
 */
@FunctionalInterface
public interface AnalyticsHistoryCheck {

    boolean holds(String orderId);
}
