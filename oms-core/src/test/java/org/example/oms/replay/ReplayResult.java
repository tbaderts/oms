package org.example.oms.replay;

import java.util.ArrayList;
import java.util.List;

/**
 * The outcome of a replay (SPEC-0024).
 *
 * @param recorded the source history
 * @param replayed the history the replay produced
 * @param diff the comparison of the two
 * @param notApplied recorded commands the replay could not apply: refused, failed, or missing
 *     from the row. Every recorded event was an applied command, so each one is a regression
 */
public record ReplayResult(
        OrderSnapshotHistory recorded, OrderSnapshotHistory replayed, DiffSummary diff, List<String> notApplied) {

    public ReplayResult {
        notApplied = List.copyOf(notApplied);
    }

    /** Whether today's code failed to reproduce the recorded history. */
    public boolean failed() {
        return diff.hasDifferences() || !notApplied.isEmpty();
    }

    /** The orders whose events were read as legacy (no {@code schema_version}). */
    public List<String> legacyOrderIds() {
        return recorded.legacyOrderIds();
    }

    /** A summary line, then every command not applied and every difference. */
    public List<String> lines() {
        List<String> lines = new ArrayList<>();
        lines.add("Replayed " + recorded.events().size() + " recorded event(s): "
                + notApplied.size() + " not applied, " + diff.items().size() + " difference(s)");
        notApplied.forEach(line -> lines.add("  not applied: " + line));
        diff.lines().stream().skip(1).forEach(lines::add);
        return lines;
    }

    /** Fails with every difference listed, so a replay is a test. */
    public void assertNoDifferences() {
        if (failed()) {
            throw new AssertionError(String.join(System.lineSeparator(), lines()));
        }
    }
}
