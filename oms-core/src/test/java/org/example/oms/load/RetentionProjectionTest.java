package org.example.oms.load;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * SPEC-0052 AC-10: the year projection from measured per-order figures against the proposed budgets
 * (20,000 orders a day, 30-day retention, at most 25 GB of hot storage and 10 minutes of vacuum a day).
 */
class RetentionProjectionTest {

    @Test
    void steadyStateStorageIsPerOrderBytesTimesRetainedOrders() {
        // 14.4 KB an order (as measured): 20,000 × 30 = 600,000 retained orders → 8.64 GB (decimal), within 25 GB
        RetentionProjection p = RetentionProjection.proposed(14_400, 19_000, 0.2);
        assertEquals(600_000, p.retainedOrders());
        assertEquals(8_640_000_000L, p.steadyStateBytes());
        assertTrue(p.withinStorageBudget());
    }

    @Test
    void storageOverBudgetIsReportedNotHidden() {
        RetentionProjection p = RetentionProjection.proposed(50_000, 19_000, 0.2); // 30 GB
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
    void unmeasuredVacuumHasNoVerdict() {
        RetentionProjection p = RetentionProjection.proposed(10_000, 19_000, Double.NaN);
        assertFalse(p.vacuumMeasured());
        assertFalse(p.withinVacuumBudget(), "no verdict is not a pass");
        assertTrue(p.report().contains("vacuum per day: not measured"), p.report());
        assertFalse(p.report().contains("vacuum per day: 0.0 s"), p.report());
    }

    @Test
    void unmeasuredStorageHasNoVerdict() {
        // a retention pass archives the orders as they close, so it does not measure storage
        RetentionProjection p = RetentionProjection.proposed(null, null, 0.03);
        assertFalse(p.storageMeasured());
        assertFalse(p.withinStorageBudget(), "no verdict is not a pass");
        assertTrue(p.report().contains("hot storage at steady state: not measured"), p.report());
        assertTrue(p.withinVacuumBudget());
        assertTrue(p.report().contains("WAL not measured"), p.report());
        assertFalse(p.report().contains("0 bytes WAL"), p.report());
    }

    @Test
    void negativeGrowthIsRejected() {
        // free space reused by the run: growth says nothing about bytes per order, so no projection
        assertThrows(IllegalArgumentException.class, () -> RetentionProjection.proposed(-196, 19_000, 0.2));
        assertThrows(IllegalArgumentException.class, () -> RetentionProjection.proposed(10_000, -1, 0.2));
    }

    @Test
    void yearlyWalIsReportedForInformation() {
        RetentionProjection p = RetentionProjection.proposed(10_000, 19_000, 0.2);
        assertEquals(19_000L * 20_000 * 365, p.walBytesPerYear());
        assertTrue(p.report().contains("WAL per year"), p.report());
    }
}
