package org.example.oms.load;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * SPEC-0052 AC-10: the year projection from measured per-order figures against the proposed budgets
 * (20,000 orders a day, 90-day retention, at most 25 GB of hot storage and 10 minutes of vacuum a day).
 */
class RetentionProjectionTest {

    @Test
    void steadyStateStorageIsPerOrderBytesTimesRetainedOrders() {
        // 10 KB an order: 20,000 × 90 = 1.8 M retained orders → 18 GB (decimal), within 25 GB
        RetentionProjection p = RetentionProjection.proposed(10_000, 19_000, 0.2);
        assertEquals(1_800_000, p.retainedOrders());
        assertEquals(18_000_000_000L, p.steadyStateBytes());
        assertTrue(p.withinStorageBudget());
    }

    @Test
    void storageOverBudgetIsReportedNotHidden() {
        RetentionProjection p = RetentionProjection.proposed(20_000, 19_000, 0.2); // 36 GB
        assertFalse(p.withinStorageBudget());
        assertTrue(p.report().contains("OVER budget"), p.report());
    }

    @Test
    void vacuumPerDayIsArchivedOrdersPerDayTimesMeasuredCost() {
        // at steady state a day archives a day's orders: 20,000 × 0.02 ms = 400 ms ≤ 10 min
        RetentionProjection within = RetentionProjection.proposed(10_000, 19_000, 0.02);
        assertEquals(400, within.vacuumMillisPerDay(), 0.001);
        assertTrue(within.withinVacuumBudget());
        // 20,000 × 40 ms = 800 s > 600 s
        assertFalse(RetentionProjection.proposed(10_000, 19_000, 40).withinVacuumBudget());
    }

    @Test
    void yearlyWalIsReportedForInformation() {
        RetentionProjection p = RetentionProjection.proposed(10_000, 19_000, 0.2);
        assertEquals(19_000L * 20_000 * 365, p.walBytesPerYear());
        assertTrue(p.report().contains("WAL per year"), p.report());
    }
}
