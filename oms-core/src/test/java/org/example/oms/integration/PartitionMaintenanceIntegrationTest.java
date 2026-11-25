package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import org.example.oms.archive.PartitionMaintenance;
import org.example.oms.service.leadership.Leadership;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * SPEC-0052 AC-3 and AC-8: partition maintenance keeps monthly partitions ahead of time, so an event
 * at a month boundary lands in its month, and drops past partitions emptied by archiving while
 * keeping one that still holds a retained order's event. Uses months far from today, so the shared
 * database's current partitions are untouched.
 */
class PartitionMaintenanceIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private Leadership leadership;

    private SimpleMeterRegistry meters;

    private PartitionMaintenance at(String instant, int monthsAhead, int retentionDays) {
        meters = new SimpleMeterRegistry();
        return new PartitionMaintenance(
                jdbc, leadership, meters, Clock.fixed(Instant.parse(instant), ZoneOffset.UTC), true, monthsAhead, retentionDays);
    }

    private boolean exists(String partition) {
        return jdbc.queryForObject("select count(*) from pg_class where relname = ?", Integer.class, partition) == 1;
    }

    private String partitionOf(String orderId) {
        return jdbc.queryForObject("select tableoid::regclass::text from order_events where order_id = ?", String.class, orderId);
    }

    private String insertEventAt(String timeStamp) {
        String orderId = "PM-" + UUID.randomUUID();
        jdbc.update(
                "insert into order_events (id, order_id, version, event, resulting_state, time_stamp) "
                        + "values (nextval('order_event_seq'), ?, 1, 'NEW_ORDER', 'UNACK', ?::timestamptz)",
                orderId, timeStamp);
        return orderId;
    }

    @AfterEach
    void dropTestPartitions() {
        jdbc.update("delete from order_events where order_id like 'PM-%'");
        for (String p : List.of("order_events_p203005", "order_events_p203006", "order_events_p203007",
                "order_events_p202501", "order_events_p202502")) {
            if (exists(p)) {
                jdbc.execute("alter table order_events detach partition " + p);
                jdbc.execute("drop table " + p);
            }
        }
    }

    @Test
    void createsPartitionsTwoMonthsAhead() {
        at("2030-05-15T12:00:00Z", 2, 90).ensureAhead();

        assertTrue(exists("order_events_p203005"));
        assertTrue(exists("order_events_p203006"));
        assertTrue(exists("order_events_p203007"));
        // idempotent
        at("2030-05-20T12:00:00Z", 2, 90).ensureAhead();
        assertTrue(exists("order_events_p203007"));
    }

    @Test
    void eventAtAMonthBoundaryLandsInTheNewMonth() {
        at("2030-05-15T12:00:00Z", 2, 90).ensureAhead();

        assertEquals("order_events_p203006", partitionOf(insertEventAt("2030-06-01T00:00:00Z")));
        assertEquals("order_events_p203005", partitionOf(insertEventAt("2030-05-31T23:59:59.999999Z")));
    }

    @Test
    void dropsAnEmptiedPastPartitionAndKeepsOneWithARetainedRow() {
        at("2025-01-10T00:00:00Z", 1, 90).ensureAhead(); // p202501, p202502
        String retained = insertEventAt("2025-02-03T09:00:00Z");
        String archived = insertEventAt("2025-01-20T09:00:00Z");
        jdbc.update("delete from order_events where order_id = ?", archived); // what archiving does

        PartitionMaintenance maintenance = at("2030-05-15T12:00:00Z", 2, 90);
        List<String> dropped = maintenance.dropEmptyPast();

        assertEquals(List.of("order_events_p202501"), dropped);
        assertFalse(exists("order_events_p202501"));
        assertTrue(exists("order_events_p202502"));
        assertEquals("order_events_p202502", partitionOf(retained));
        assertEquals(1.0, meters.counter("oms.retention.partitions_dropped").count());
        // the default partition is never dropped, even when empty
        assertTrue(exists("order_events_default"));
    }

    /**
     * DETACH waits at most the lock timeout behind a transaction holding order_events: it gives up
     * without dropping, and the next run drops the partition.
     */
    @Test
    void aBlockedDropGivesUpAndTheNextRunDropsIt() throws Exception {
        at("2025-01-10T00:00:00Z", 1, 90).ensureAhead(); // p202501, p202502: two empty past months
        PartitionMaintenance maintenance = at("2030-05-15T12:00:00Z", 2, 90);
        javax.sql.DataSource dataSource = jdbc.getDataSource();
        try (java.sql.Connection holder = dataSource.getConnection()) {
            holder.setAutoCommit(false);
            try (java.sql.Statement statement = holder.createStatement()) {
                statement.execute("select count(*) from order_events"); // ACCESS SHARE until commit
            }
            long start = System.nanoTime();
            assertFalse(maintenance.dropEmptyPast().contains("order_events_p202501"), "blocked: not dropped");
            long waitedMillis = (System.nanoTime() - start) / 1_000_000;
            // one lock timeout for the run, not one per partition (two or more here)
            assertTrue(waitedMillis < 9_000, "stopped after the first lock timeout, waited " + waitedMillis + " ms");
            assertTrue(exists("order_events_p202501"));
            assertTrue(exists("order_events_p202502"));
            holder.commit();
        }
        assertTrue(maintenance.dropEmptyPast().containsAll(List.of("order_events_p202501", "order_events_p202502")), "the next run drops them");
        assertFalse(exists("order_events_p202501"));
        assertFalse(exists("order_events_p202502"));
    }

    @Test
    void keepsPastPartitionsInsideTheRetentionPeriod() {
        at("2030-05-15T12:00:00Z", 2, 90).ensureAhead();

        // May 2030 is the current month, and within retention: nothing to drop, though empty.
        assertEquals(List.of(), at("2030-05-20T12:00:00Z", 2, 90).dropEmptyPast().stream()
                .filter(p -> p.startsWith("order_events_p2030")).toList());
        assertTrue(exists("order_events_p203005"));
    }
}
