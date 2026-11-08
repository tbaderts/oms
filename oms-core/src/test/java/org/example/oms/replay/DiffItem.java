package org.example.oms.replay;

/**
 * One difference between a recorded and a replayed event (SPEC-0024).
 *
 * @param orderId the order
 * @param version the order's event version
 * @param field the snapshot field that differs, {@code resultingState}, {@code event}, or
 *     {@link SnapshotDiff#EVENT} when the event exists on one side only
 * @param sourceValue the recorded value
 * @param replayedValue the replayed value
 */
public record DiffItem(String orderId, long version, String field, String sourceValue, String replayedValue) {

    @Override
    public String toString() {
        return orderId + " v" + version + " " + field + ": recorded " + sourceValue + ", replayed " + replayedValue;
    }
}
