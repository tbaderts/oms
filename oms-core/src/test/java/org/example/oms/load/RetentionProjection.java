package org.example.oms.load;

import java.util.Locale;

/**
 * The year projection for SPEC-0052 AC-10: from storage, WAL and vacuum figures measured per order by
 * the load suite, what the OMS database holds and spends at steady state under retention, against
 * the budgets proposed in the ticket. Decimal units (1 GB = 10^9 bytes).
 *
 * @param bytesPerOrder              table and index bytes per retained order (history tables)
 * @param walBytesPerOrder           WAL bytes written per order through its life
 * @param vacuumMillisPerArchivedOrder vacuum time per archived order, after the archive deletes
 */
record RetentionProjection(
        long bytesPerOrder,
        long walBytesPerOrder,
        double vacuumMillisPerArchivedOrder,
        long ordersPerDay,
        int retentionDays,
        long storageBudgetBytes,
        long vacuumBudgetMillisPerDay) {

    /** The budgets proposed in SPEC-0052: 20,000 orders a day, 90 days, ≤ 25 GB, ≤ 10 minutes a day. */
    static RetentionProjection proposed(long bytesPerOrder, long walBytesPerOrder, double vacuumMillisPerArchivedOrder) {
        return new RetentionProjection(bytesPerOrder, walBytesPerOrder, vacuumMillisPerArchivedOrder,
                20_000, 90, 25_000_000_000L, 10 * 60 * 1000);
    }

    long retainedOrders() {
        return ordersPerDay * retentionDays;
    }

    long steadyStateBytes() {
        return bytesPerOrder * retainedOrders();
    }

    boolean withinStorageBudget() {
        return steadyStateBytes() <= storageBudgetBytes;
    }

    /** At steady state each day archives about a day's orders; their deletes are what vacuum cleans. */
    double vacuumMillisPerDay() {
        return vacuumMillisPerArchivedOrder * ordersPerDay;
    }

    boolean withinVacuumBudget() {
        return vacuumMillisPerDay() <= vacuumBudgetMillisPerDay;
    }

    long walBytesPerYear() {
        return walBytesPerOrder * ordersPerDay * 365;
    }

    String report() {
        return String.format(Locale.ROOT, String.join("\n",
                        "Retention projection (SPEC-0052 AC-10): %,d orders/day, %d-day retention",
                        "  per order: %,d bytes hot storage, %,d bytes WAL, %.3f ms vacuum when archived",
                        "  hot storage at steady state: %.2f GB for %,d retained orders; budget %.0f GB: %s",
                        "  vacuum per day: %.1f s; budget %.0f s: %s",
                        "  WAL per year (information): %.1f GB"),
                ordersPerDay, retentionDays,
                bytesPerOrder, walBytesPerOrder, vacuumMillisPerArchivedOrder,
                steadyStateBytes() / 1e9, retainedOrders(), storageBudgetBytes / 1e9, withinStorageBudget() ? "within budget" : "OVER budget",
                vacuumMillisPerDay() / 1000, vacuumBudgetMillisPerDay / 1000.0, withinVacuumBudget() ? "within budget" : "OVER budget",
                walBytesPerYear() / 1e9);
    }
}
