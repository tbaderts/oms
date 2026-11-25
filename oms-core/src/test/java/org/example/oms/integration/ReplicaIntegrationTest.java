package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.example.oms.archive.ArchivePreconditions;
import org.example.oms.archive.PartitionMaintenance;
import org.example.oms.archive.ReplicaVerifier;
import org.example.oms.archive.RetentionJob;
import org.example.oms.projection.ProjectionRebuilder;
import org.example.oms.service.leadership.Leadership;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * SPEC-0052 AC-4: the archive replica receives the order history's inserts and updates, and keeps
 * rows the primary deletes or drops with a partition.
 */
class ReplicaIntegrationTest extends AbstractArchiveIntegrationTest {

    /** Frees this world's replication worker and slot for the classes that run after it. */
    @org.junit.jupiter.api.AfterAll
    static void dropSubscription() {
        ReplicaTestSupport.dropSubscription("replica_it");
    }

    @DynamicPropertySource
    static void world(DynamicPropertyRegistry registry) {
        archiveWorld(registry, "replica_it");
    }

    @Test
    void replicaReceivesInsertsAndUpdates() throws Exception {
        String orderId = closedFilledOrder();

        awaitReplicated(orderId);
        for (String table : HISTORY_TABLES) {
            assertTrue(count(replica.jdbc(), table, orderId) > 0, table + " has the order's rows on the replica");
        }
        // updates arrive too: the order row is CLOSED there, as on the primary
        assertEquals("CLOSED", replica.jdbc().queryForObject("select state from orders where order_id = ?", String.class, orderId));
    }

    @Test
    void replicaKeepsRowsDeletedOnThePrimary() throws Exception {
        String orderId = closedFilledOrder();
        awaitReplicated(orderId);

        for (String table : HISTORY_TABLES) {
            jdbc.update("delete from " + table + " where order_id = ?", orderId);
        }
        // a later change still replicates, so the deletes have been processed by now
        String later = closedFilledOrder();
        awaitReplicated(later);

        assertEquals(0, count(jdbc, "orders", orderId));
        for (String table : HISTORY_TABLES) {
            assertTrue(count(replica.jdbc(), table, orderId) > 0, table + " still on the replica");
        }
    }

    @Test
    void replicaKeepsRowsOfAPartitionDroppedOnThePrimary() throws Exception {
        jdbc.execute("CREATE TABLE IF NOT EXISTS order_events_p203101 PARTITION OF order_events "
                + "FOR VALUES FROM ('2031-01-01 00:00:00+00') TO ('2031-02-01 00:00:00+00')");
        String orderId = "RP-" + UUID.randomUUID();
        jdbc.update("insert into order_events (id, order_id, version, event, resulting_state, time_stamp) "
                + "values (nextval('order_event_seq'), ?, 1, 'NEW_ORDER', 'UNACK', '2031-01-15 10:00:00+00')", orderId);
        awaitUntil(() -> count(replica.jdbc(), "order_events", orderId) == 1, orderId + " on the replica");

        jdbc.execute("ALTER TABLE order_events DETACH PARTITION order_events_p203101");
        jdbc.execute("DROP TABLE order_events_p203101");
        String later = closedFilledOrder();
        awaitReplicated(later);

        assertEquals(0, count(jdbc, "order_events", orderId));
        assertEquals(1, count(replica.jdbc(), "order_events", orderId));
        assertEquals(1, count(replica.jdbc(), "order_event_keys", orderId));
    }

    @Autowired PlatformTransactionManager transactionManager;
    @Autowired Leadership leadership;
    @Autowired ProjectionRebuilder projectionRebuilder;

    private RetentionJob archiver() {
        return new RetentionJob(jdbc, transactionManager, leadership, Optional.of(new ReplicaVerifier(jdbc, replica.jdbc())),
                new ArchivePreconditions(Optional.empty(), false), new SimpleMeterRegistry(), Clock.systemUTC(),
                true, 0, 500, false);
    }

    /**
     * After archiving, a new order may reuse the archived order's (session, clOrdId) on the primary.
     * The replica keeps the archived row, so it must not refuse the new one: replication would halt.
     */
    @Test
    void replicationSurvivesClOrdIdReuseAfterArchiving() throws Exception {
        String clOrdId = "CL-REUSE-" + UUID.randomUUID();
        String first = closedFilledOrder(clOrdId);
        awaitReplicated(first);
        assertEquals(RetentionJob.Outcome.ARCHIVED, archiver().run().get(first));

        String reused = closedFilledOrder(clOrdId);
        awaitReplicated(reused);
        String later = closedFilledOrder();
        awaitReplicated(later);

        assertEquals(2, replica.jdbc().queryForObject(
                "select count(*) from orders where session_id = 'SES-PRJ' and cl_ord_id = ?", Integer.class, clOrdId));
        // relaxed on the replica only: the primary still refuses a clOrdId among the orders it holds
        String constraint = "select count(*) from pg_constraint where conname = 'uq_orders_session_cl_ord_id'";
        assertEquals(1, jdbc.queryForObject(constraint, Integer.class));
        assertEquals(0, replica.jdbc().queryForObject(constraint, Integer.class));
    }

    /**
     * A projection rebuild must replicate as what it is, rows rewritten in place: with fresh row ids
     * for the same natural keys the replica could not hold them, and replication would halt.
     */
    @Test
    void replicationSurvivesAProjectionRebuild() throws Exception {
        String before = closedFilledOrder();
        awaitReplicated(before);

        projectionRebuilder.rebuild("order_execution");

        String later = closedFilledOrder();
        awaitReplicated(later);
        awaitReplicated(before); // the rebuilt rows of an earlier order still match, row for row
    }

    /** AC-8 end to end: partition maintenance drops a partition emptied the way archiving empties it, and the replica keeps its rows. */
    @Test
    void maintenanceDropsAnEmptiedPartitionAndTheReplicaKeepsItsRows() throws Exception {
        jdbc.execute("CREATE TABLE IF NOT EXISTS order_events_p202501 PARTITION OF order_events "
                + "FOR VALUES FROM ('2025-01-01 00:00:00+00') TO ('2025-02-01 00:00:00+00')");
        String orderId = "PD-" + UUID.randomUUID();
        jdbc.update("insert into order_events (id, order_id, version, event, resulting_state, time_stamp) "
                + "values (nextval('order_event_seq'), ?, 1, 'NEW_ORDER', 'UNACK', '2025-01-15 10:00:00+00')", orderId);
        awaitUntil(() -> count(replica.jdbc(), "order_events", orderId) == 1, orderId + " on the replica");
        // archiving deletes the order's history: the same statements RetentionJob issues
        jdbc.update("delete from order_event_keys where order_id = ?", orderId);
        jdbc.update("delete from order_events where order_id = ?", orderId);

        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        List<String> dropped = new PartitionMaintenance(jdbc, leadership, meters, Clock.systemUTC(), true, 2, 0).dropEmptyPast();
        String later = closedFilledOrder();
        awaitReplicated(later);

        assertTrue(dropped.contains("order_events_p202501"), "dropped: " + dropped);
        assertEquals(0, jdbc.queryForObject("select count(*) from pg_class where relname = 'order_events_p202501'", Integer.class));
        assertEquals(1, count(replica.jdbc(), "order_events", orderId), "the replica keeps the dropped partition's rows");
        assertEquals(1, count(replica.jdbc(), "order_event_keys", orderId));
    }
}
