package org.example.oms.replay;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * An event log's order snapshots, in the order the events were appended (SPEC-0024): the source
 * history a replay reproduces, or the history the replay produced.
 */
public record OrderSnapshotHistory(List<StoredEvent> events) {

    public OrderSnapshotHistory {
        events = List.copyOf(events);
    }

    /** The events keyed by (orderId, version), in append order. */
    public Map<Key, StoredEvent> byKey() {
        Map<Key, StoredEvent> keyed = new LinkedHashMap<>();
        for (StoredEvent event : events) {
            keyed.put(new Key(event.orderId(), event.version()), event);
        }
        return keyed;
    }

    /** The orderIds of events read from rows without {@code schema_version}, in first-seen order. */
    public List<String> legacyOrderIds() {
        return events.stream().filter(StoredEvent::legacy).map(StoredEvent::orderId).distinct().toList();
    }

    /** An event's identity in an order's log. */
    public record Key(String orderId, long version) {}
}
