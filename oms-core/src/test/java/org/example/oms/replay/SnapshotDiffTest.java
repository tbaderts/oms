package org.example.oms.replay;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.junit.jupiter.api.Test;

/** SPEC-0024 AC-2: the snapshot diff names each differing (orderId, version) and field. */
class SnapshotDiffTest {

    @Test
    void identicalHistoriesHaveNoDifferences() {
        OrderSnapshotHistory source = history(event(1, "ORD-1", 1, State.UNACK, "100", "0"),
                event(2, "ORD-1", 2, State.LIVE, "100", "0"));
        OrderSnapshotHistory replayed = history(event(7, "ORD-1", 1, State.UNACK, "100.0000", "0.0000"),
                event(8, "ORD-1", 2, State.LIVE, "100.0000", "0.0000"));

        DiffSummary summary = SnapshotDiff.compare(source, replayed);

        assertFalse(summary.hasDifferences(), summary.lines().toString());
        assertEquals(2, summary.compared());
    }

    @Test
    void reportsEachDifferingVersionAndField() {
        OrderSnapshotHistory source = history(
                event(1, "ORD-1", 1, State.UNACK, "100", "0"),
                event(2, "ORD-1", 2, State.LIVE, "100", "0"),
                event(3, "ORD-1", 3, State.LIVE, "100", "40"));
        OrderSnapshotHistory replayed = history(
                event(1, "ORD-1", 1, State.UNACK, "100", "0"),
                event(2, "ORD-1", 2, State.LIVE, "100", "0"),
                event(3, "ORD-1", 3, State.FILLED, "100", "100"));

        DiffSummary summary = SnapshotDiff.compare(source, replayed);

        assertTrue(summary.hasDifferences());
        assertEquals(3, summary.compared());
        assertTrue(summary.items().contains(new DiffItem("ORD-1", 3, "cumQty", "40", "100")), summary.lines().toString());
        assertTrue(summary.items().contains(new DiffItem("ORD-1", 3, "state", "LIVE", "FILLED")), summary.lines().toString());
        assertTrue(summary.items().contains(new DiffItem("ORD-1", 3, "resultingState", "LIVE", "FILLED")), summary.lines().toString());
        assertTrue(summary.items().stream().allMatch(item -> item.version() == 3), "only version 3 differs");
        assertTrue(summary.lines().stream().anyMatch(line -> line.contains("ORD-1") && line.contains("v3") && line.contains("cumQty")));
    }

    @Test
    void reportsEventsMissingOnEitherSide() {
        OrderSnapshotHistory source = history(
                event(1, "ORD-1", 1, State.UNACK, "100", "0"),
                event(2, "ORD-1", 2, State.LIVE, "100", "0"));
        OrderSnapshotHistory replayed = history(
                event(1, "ORD-1", 1, State.UNACK, "100", "0"),
                event(2, "ORD-2", 1, State.UNACK, "5", "0"));

        DiffSummary summary = SnapshotDiff.compare(source, replayed);

        assertTrue(summary.items().contains(new DiffItem("ORD-1", 2, SnapshotDiff.EVENT, "present", "missing")));
        assertTrue(summary.items().contains(new DiffItem("ORD-2", 1, SnapshotDiff.EVENT, "missing", "present")));
    }

    @Test
    void ignoresNonDeterministicFields() {
        StoredEvent recorded = event(1, "ORD-1", 1, State.UNACK, "100", "0");
        Order later = recorded.snapshot().toBuilder()
                .id(99L)
                .orderReceivedTime(Instant.now())
                .transactTime(Instant.now())
                .build();
        StoredEvent replayedEvent = new StoredEvent(5, "ORD-1", 1, "EVENT", "UNACK", 1, false, null, later);

        DiffSummary summary = SnapshotDiff.compare(history(recorded), history(replayedEvent));

        assertFalse(summary.hasDifferences(), summary.lines().toString());
    }

    private static OrderSnapshotHistory history(StoredEvent... events) {
        return new OrderSnapshotHistory(List.of(events));
    }

    private static StoredEvent event(long id, String orderId, long version, State state, String orderQty, String cumQty) {
        Order snapshot = Order.builder()
                .id(id)
                .orderId(orderId)
                .txNr(version)
                .orderQty(new BigDecimal(orderQty))
                .cumQty(new BigDecimal(cumQty))
                .leavesQty(new BigDecimal(orderQty).subtract(new BigDecimal(cumQty)))
                .state(state)
                .transactTime(Instant.parse("2026-01-01T00:00:00Z"))
                .build();
        return new StoredEvent(id, orderId, version, "EVENT", state.name(), 1, false, null, snapshot);
    }
}
