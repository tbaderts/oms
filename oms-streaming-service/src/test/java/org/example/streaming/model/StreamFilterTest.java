package org.example.streaming.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

/**
 * SPEC-0057: the client bounds the snapshot with {@code snapshotLimit}; the server ends the snapshot
 * with a {@code SNAPSHOT_END} marker that carries the number of matching rows.
 */
class StreamFilterTest {

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void snapshotLimitIsReadFromTheClientsJson() {
        StreamFilter filter = json.readValue(
                "{\"filters\":[],\"includeSnapshot\":true,\"snapshotLimit\":2000}", StreamFilter.class);

        assertEquals(2000, filter.getSnapshotLimit());
        assertEquals(2000, filter.effectiveSnapshotLimit());
    }

    @Test
    void withoutSnapshotLimitTheSnapshotIsUnbounded() {
        StreamFilter filter = json.readValue("{\"filters\":[],\"includeSnapshot\":true}", StreamFilter.class);

        assertNull(filter.getSnapshotLimit());
        assertEquals(Integer.MAX_VALUE, filter.effectiveSnapshotLimit());
    }

    @Test
    void snapshotLimitIsKeptWithinBounds() {
        assertEquals(0, StreamFilter.builder().snapshotLimit(-5).build().effectiveSnapshotLimit());
        assertEquals(0, StreamFilter.builder().snapshotLimit(0).build().effectiveSnapshotLimit());
        assertEquals(StreamFilter.MAX_SNAPSHOT_LIMIT,
                StreamFilter.builder().snapshotLimit(5_000_000).build().effectiveSnapshotLimit());
    }

    @Test
    void snapshotEndMarkersCarryTheMatchingCount() {
        OrderEvent orders = OrderEvent.snapshotEnd(8300);
        ExecutionEvent executions = ExecutionEvent.snapshotEnd(42);

        assertEquals("SNAPSHOT_END", orders.getEventType());
        assertEquals(8300L, orders.getSnapshotTotal());
        assertNull(orders.getOrder());
        assertNotNull(orders.getTimestamp());
        assertEquals("SNAPSHOT_END", executions.getEventType());
        assertEquals(42L, executions.getSnapshotTotal());
        assertNull(executions.getExecution());
        assertEquals(8300, json.readTree(json.writeValueAsString(orders)).get("snapshotTotal").asInt());
    }
}
