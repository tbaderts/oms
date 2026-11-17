package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.util.List;

import org.example.common.model.State;
import org.example.oms.archive.ReplicaDatabase;
import org.example.oms.service.endofday.EndOfDayService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Base for the archive tests (SPEC-0052). Each subclass runs in a world of its own: primary
 * database {@code oms_<name>} and replica database {@code replica_<name>}, subscribed to it. It
 * registers both from its own {@code @DynamicPropertySource} with {@link #archiveWorld}.
 */
abstract class AbstractArchiveIntegrationTest extends AbstractFillFlowIntegrationTest {

    /** The order-history tables, as published to the replica and archived together. */
    static final List<String> HISTORY_TABLES =
            List.of("orders", "order_events", "order_event_keys", "executions", "command_log", "order_execution_projection");

    @Autowired JdbcTemplate jdbc;
    @Autowired ReplicaDatabase replica;
    @Autowired EndOfDayService endOfDayService;

    /** Call from the subclass's {@code @DynamicPropertySource}. */
    static void archiveWorld(org.springframework.test.context.DynamicPropertyRegistry registry, String name) {
        isolate(name, "commands-" + name);
        ReplicaTestSupport.register(registry, name);
    }

    /** An order created, accepted, filled in full and closed by end of day; returns its id. */
    String closedFilledOrder() throws Exception {
        String orderId = createLiveOrder();
        assertEquals(201, postFill(orderId + "-F1", orderId, "100", null));
        awaitUntil(() -> state(orderId) == State.FILLED, orderId + " FILLED");
        Thread.sleep(5);
        endOfDayService.run(Instant.now());
        awaitUntil(() -> state(orderId) == State.CLOSED, orderId + " CLOSED");
        // Archiving skips an order whose messages are not yet published: wait for the relay to drain them.
        awaitUntil(() -> count(jdbc, "outbox", orderId) == 0, orderId + " outbox drained");
        return orderId;
    }

    /** One table's rows of an order, as JSON text in key order, on the given database. */
    static List<String> rows(JdbcTemplate db, String table, String orderId) {
        String key = "order_event_keys".equals(table) ? "version" : "id";
        return db.queryForList(
                "select row_to_json(t)::text from " + table + " t where order_id = ? order by " + key, String.class, orderId);
    }

    /** Whether the replica holds exactly the primary's rows of the order, in every history table. */
    boolean replicaMatches(String orderId) {
        return HISTORY_TABLES.stream().allMatch(t -> rows(jdbc, t, orderId).equals(rows(replica.jdbc(), t, orderId)));
    }

    /** Replication budget: a world's first order waits for the new subscription's initial table sync. */
    static final java.time.Duration REPLICATION_TIMEOUT = java.time.Duration.ofSeconds(60);

    void awaitReplicated(String orderId) throws InterruptedException {
        long deadline = System.nanoTime() + REPLICATION_TIMEOUT.toNanos();
        while (!replicaMatches(orderId)) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("Timed out after " + REPLICATION_TIMEOUT + " waiting for: " + orderId + " replicated");
            }
            Thread.sleep(100);
        }
    }

    int count(JdbcTemplate db, String table, String orderId) {
        return db.queryForObject("select count(*) from " + table + " where order_id = ?", Integer.class, orderId);
    }
}
