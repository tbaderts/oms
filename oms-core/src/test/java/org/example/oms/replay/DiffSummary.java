package org.example.oms.replay;

import java.util.List;

/**
 * The outcome of comparing two snapshot histories (SPEC-0024).
 *
 * @param compared the number of (orderId, version) events present on both sides
 * @param items every difference found
 */
public record DiffSummary(int compared, List<DiffItem> items) {

    public DiffSummary {
        items = List.copyOf(items);
    }

    public boolean hasDifferences() {
        return !items.isEmpty();
    }

    /** A headline and one line per difference, for logs and assertion messages. */
    public List<String> lines() {
        java.util.ArrayList<String> lines = new java.util.ArrayList<>();
        lines.add(compared + " event(s) compared, " + items.size() + " difference(s)");
        items.forEach(item -> lines.add("  " + item));
        return lines;
    }
}
