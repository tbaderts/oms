package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.UUID;

import org.junit.jupiter.api.Test;
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
}
