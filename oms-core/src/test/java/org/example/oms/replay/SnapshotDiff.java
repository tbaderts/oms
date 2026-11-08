package org.example.oms.replay;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Compares a recorded snapshot history with a replayed one, event by event, keyed by (orderId,
 * version) (SPEC-0024).
 *
 * <p>Every snapshot field is compared except the {@link #IGNORED} ones, which a replay cannot
 * reproduce: the row id the sequence assigns, and instants taken from the clock when the command
 * ran. Numbers are compared by value, so {@code 100} and {@code 100.0000} are equal. If a
 * regression ever hides in an ignored field, the ticket that finds it narrows this list.
 */
public final class SnapshotDiff {

    /** The pseudo-field of a difference where the event exists on one side only. */
    public static final String EVENT = "<event>";

    /**
     * Snapshot fields a replay cannot reproduce: the row id, and instants taken from the clock when
     * the command ran ({@code sendingTime} defaults to it when the command carries none).
     */
    public static final Set<String> IGNORED = Set.of(
            "id",
            "sendingTime",
            "transactTime",
            "tifTimestamp",
            "orderReceivedTime",
            "ackTime",
            "marketSendTime",
            "marketAckTime");

    private static final ObjectMapper JSON = JsonMapper.builder().build();

    private SnapshotDiff() {}

    public static DiffSummary compare(OrderSnapshotHistory source, OrderSnapshotHistory replayed) {
        Map<OrderSnapshotHistory.Key, StoredEvent> recorded = source.byKey();
        Map<OrderSnapshotHistory.Key, StoredEvent> reproduced = replayed.byKey();
        List<DiffItem> items = new ArrayList<>();
        int compared = 0;

        for (var entry : recorded.entrySet()) {
            OrderSnapshotHistory.Key key = entry.getKey();
            StoredEvent replayedEvent = reproduced.get(key);
            if (replayedEvent == null) {
                items.add(new DiffItem(key.orderId(), key.version(), EVENT, "present", "missing"));
                continue;
            }
            compared++;
            compareEvents(key, entry.getValue(), replayedEvent, items);
        }
        for (OrderSnapshotHistory.Key key : reproduced.keySet()) {
            if (!recorded.containsKey(key)) {
                items.add(new DiffItem(key.orderId(), key.version(), EVENT, "missing", "present"));
            }
        }
        return new DiffSummary(compared, items);
    }

    private static void compareEvents(
            OrderSnapshotHistory.Key key, StoredEvent source, StoredEvent replayed, List<DiffItem> items) {
        if (!Objects.equals(source.event(), replayed.event())) {
            items.add(new DiffItem(key.orderId(), key.version(), "event", source.event(), replayed.event()));
        }
        if (!Objects.equals(source.resultingState(), replayed.resultingState())) {
            items.add(new DiffItem(key.orderId(), key.version(), "resultingState",
                    source.resultingState(), replayed.resultingState()));
        }
        JsonNode recorded = source.snapshot() == null ? JSON.nullNode() : JSON.valueToTree(source.snapshot());
        JsonNode reproduced = replayed.snapshot() == null ? JSON.nullNode() : JSON.valueToTree(replayed.snapshot());
        Set<String> fields = new LinkedHashSet<>();
        recorded.propertyNames().forEach(fields::add);
        reproduced.propertyNames().forEach(fields::add);
        for (String field : fields) {
            if (IGNORED.contains(field)) {
                continue;
            }
            JsonNode a = recorded.get(field);
            JsonNode b = reproduced.get(field);
            if (!sameValue(a, b)) {
                items.add(new DiffItem(key.orderId(), key.version(), field, render(a), render(b)));
            }
        }
    }

    private static boolean sameValue(JsonNode a, JsonNode b) {
        boolean aEmpty = a == null || a.isNull();
        boolean bEmpty = b == null || b.isNull();
        if (aEmpty || bEmpty) {
            return aEmpty && bEmpty;
        }
        if (a.isNumber() && b.isNumber()) {
            return a.decimalValue().compareTo(b.decimalValue()) == 0;
        }
        return a.equals(b);
    }

    private static String render(JsonNode node) {
        if (node == null || node.isNull()) {
            return "null";
        }
        if (node.isNumber()) {
            return node.decimalValue().stripTrailingZeros().toPlainString();
        }
        return node.isValueNode() ? node.asString() : node.toString();
    }
}
