package org.example.oms.load;

import java.util.Locale;

/**
 * The year projection for SPEC-0052 AC-10: from storage, WAL and vacuum figures measured per order by
 * the load suite, what the OMS database holds and spends at steady state under retention, against
 * the budgets proposed in the ticket. Decimal units (1 GB = 10^9 bytes).
 *
 * <p>A figure that was not measured (storage {@code null}, vacuum {@code NaN}) gets no verdict, never
 * "within budget".
 *
 * @param bytesPerOrder              table and index bytes per retained (CLOSED) order, history tables; null if not measured
 * @param walBytesPerOrder           WAL bytes written per order through its life; null if not measured
 * @param vacuumMillisPerArchivedOrder vacuum time per archived order, after the archive deletes; NaN if not measured
 */
record RetentionProjection(
        Long bytesPerOrder,
        Long walBytesPerOrder,
        double vacuumMillisPerArchivedOrder,
        long ordersPerDay,
        int retentionDays,
        long storageBudgetBytes,
        long vacuumBudgetMillisPerDay) {

    /** The budgets proposed in SPEC-0052: 20,000 orders a day, 30 days (the requester's 2026-11-17 decision), ≤ 25 GB, ≤ 10 minutes a day. */
    static RetentionProjection proposed(long bytesPerOrder, long walBytesPerOrder, double vacuumMillisPerArchivedOrder) {
        return proposed(Long.valueOf(bytesPerOrder), Long.valueOf(walBytesPerOrder), vacuumMillisPerArchivedOrder);
    }

    /** As above; a null storage or WAL figure was not measured. */
    static RetentionProjection proposed(Long bytesPerOrder, Long walBytesPerOrder, double vacuumMillisPerArchivedOrder) {
        if ((bytesPerOrder != null && bytesPerOrder < 0) || (walBytesPerOrder != null && walBytesPerOrder < 0)) {
            // growth below zero means the run reused free space: it measures nothing about an order
            throw new IllegalArgumentException("Negative per-order figure (bytes " + bytesPerOrder + ", WAL " + walBytesPerOrder
                    + "): storage was not measured cleanly; measure over more orders on a stack with little free space");
        }
        return new RetentionProjection(bytesPerOrder, walBytesPerOrder, vacuumMillisPerArchivedOrder,
                20_000, 30, 25_000_000_000L, 10 * 60 * 1000);
    }

    long retainedOrders() {
        return ordersPerDay * retentionDays;
    }

    /** Whether storage was measured; null means it was not (a retention-pass run). */
    boolean storageMeasured() {
        return bytesPerOrder != null;
    }

    long steadyStateBytes() {
        return storageMeasured() ? bytesPerOrder * retainedOrders() : 0;
    }

    /** Within the storage budget; false when not measured, which is no verdict rather than a pass. */
    boolean withinStorageBudget() {
        return storageMeasured() && steadyStateBytes() <= storageBudgetBytes;
    }

    /** At steady state each day archives about a day's orders; their deletes are what vacuum cleans. */
    double vacuumMillisPerDay() {
        return vacuumMillisPerArchivedOrder * ordersPerDay;
    }

    /** Whether vacuum was measured; NaN means it was not (no retention pass). */
    boolean vacuumMeasured() {
        return !Double.isNaN(vacuumMillisPerArchivedOrder);
    }

    /** Within the vacuum budget; false when not measured, which is no verdict rather than a pass. */
    boolean withinVacuumBudget() {
        return vacuumMeasured() && vacuumMillisPerDay() <= vacuumBudgetMillisPerDay;
    }

    boolean walMeasured() {
        return walBytesPerOrder != null;
    }

    long walBytesPerYear() {
        return walMeasured() ? walBytesPerOrder * ordersPerDay * 365 : 0;
    }

    String report() {
        String storagePerOrder = storageMeasured()
                ? String.format(Locale.ROOT, "%,d bytes hot storage", bytesPerOrder)
                : "hot storage not measured";
        String storage = storageMeasured()
                ? String.format(Locale.ROOT, "%.2f GB for %,d retained orders; budget %.0f GB: %s", steadyStateBytes() / 1e9,
                        retainedOrders(), storageBudgetBytes / 1e9, withinStorageBudget() ? "within budget" : "OVER budget")
                : "not measured (run without OMS_LOAD_RETENTION_PASS); no verdict";
        String walPerOrder = walMeasured() ? String.format(Locale.ROOT, "%,d bytes WAL", walBytesPerOrder) : "WAL not measured";
        String walPerYear = walMeasured() ? String.format(Locale.ROOT, "%.1f GB", walBytesPerYear() / 1e9) : "not measured";
        String vacuumPerOrder = vacuumMeasured()
                ? String.format(Locale.ROOT, "%.3f ms vacuum when archived", vacuumMillisPerArchivedOrder)
                : "vacuum not measured";
        String vacuumPerDay = vacuumMeasured()
                ? String.format(Locale.ROOT, "%.1f s; budget %.0f s: %s", vacuumMillisPerDay() / 1000,
                        vacuumBudgetMillisPerDay / 1000.0, withinVacuumBudget() ? "within budget" : "OVER budget")
                : "not measured (set OMS_LOAD_RETENTION_PASS=true); no verdict";
        return String.format(Locale.ROOT, String.join("\n",
                        "Retention projection (SPEC-0052 AC-10): %,d orders/day, %d-day retention",
                        "  per order: %s, %s, %s",
                        "  hot storage at steady state: %s",
                        "  vacuum per day: %s",
                        "  WAL per year (information): %s"),
                ordersPerDay, retentionDays,
                storagePerOrder, walPerOrder, vacuumPerOrder,
                storage,
                vacuumPerDay,
                walPerYear);
    }
}
