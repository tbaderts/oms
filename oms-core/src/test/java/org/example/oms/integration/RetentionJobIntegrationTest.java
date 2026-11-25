package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.util.Map;
import java.util.Optional;

import org.example.oms.archive.AnalyticsHistoryCheck;
import org.example.oms.archive.ArchivePreconditions;
import org.example.oms.archive.ReplicaDatabase;
import org.example.oms.archive.ReplicaVerifier;
import org.example.oms.archive.RetentionJob;
import org.example.oms.archive.RetentionJob.Outcome;
import org.example.oms.service.leadership.Leadership;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * SPEC-0052 AC-5, AC-6, AC-7: archiving deletes a closed order's history from the OMS only after the
 * replica is verified to hold it, refuses (and retries later) when the replica is behind, different
 * or unreachable, and honours the analytics precondition when it is switched on.
 */
@ExtendWith(OutputCaptureExtension.class)
class RetentionJobIntegrationTest extends AbstractArchiveIntegrationTest {

    /** Frees this world's replication worker and slot for the classes that run after it. */
    @org.junit.jupiter.api.AfterAll
    static void dropSubscription() {
        ReplicaTestSupport.dropSubscription("retention_it");
    }

    @DynamicPropertySource
    static void world(DynamicPropertyRegistry registry) {
        archiveWorld(registry, "retention_it");
    }

    @Autowired PlatformTransactionManager transactionManager;
    @Autowired Leadership leadership;
    @Autowired Clock clock;

    private SimpleMeterRegistry meters;

    /** A job with the given retention, against the given replica (by default the real one). */
    private RetentionJob job(int retentionDays, ReplicaVerifier verifier, ArchivePreconditions preconditions) {
        meters = new SimpleMeterRegistry();
        return new RetentionJob(jdbc, transactionManager, leadership, Optional.of(verifier), preconditions, meters, clock,
                true, retentionDays, 500, false);
    }

    private RetentionJob job(int retentionDays) {
        return job(retentionDays, new ReplicaVerifier(jdbc, replica.jdbc()), new ArchivePreconditions(Optional.empty(), false));
    }

    /** A writable connection to this class's replica database, to make it differ or fall behind. */
    private JdbcTemplate replicaAdmin() {
        ReplicaDatabase.ReplicaProperties p = replica.properties();
        return new JdbcTemplate(new DriverManagerDataSource(p.url(), p.username(), p.password()));
    }

    private double failures(String reason) {
        var counter = meters.find("oms.retention.failures").tag("reason", reason).counter();
        return counter == null ? 0 : counter.count();
    }

    private boolean goneFromPrimaryKeptOnReplica(String orderId) {
        return HISTORY_TABLES.stream().allMatch(t -> count(jdbc, t, orderId) == 0)
                && HISTORY_TABLES.stream().allMatch(t -> count(replica.jdbc(), t, orderId) > 0);
    }

    @Test
    void archivesAnOrderClosedBeyondRetention() throws Exception {
        String orderId = closedFilledOrder();
        awaitReplicated(orderId);

        Map<String, Outcome> outcomes = job(0).run();

        assertEquals(Outcome.ARCHIVED, outcomes.get(orderId));
        assertTrue(goneFromPrimaryKeptOnReplica(orderId));
        // Earlier tests in this world may leave eligible orders too: the counter counts every one archived.
        long archivedInRun = outcomes.values().stream().filter(o -> o == Outcome.ARCHIVED).count();
        assertEquals(archivedInRun, meters.counter("oms.retention.archived").count(), 0.0001);
    }

    @Test
    void leavesRecentOpenAndOutboxPendingOrders() throws Exception {
        String recent = closedFilledOrder();
        String pending = closedFilledOrder();
        // After the last end of day: that run would expire and close a DAY order created before it.
        String open = createLiveOrder();
        // a pending outbox row the relay leaves alone (attempts far beyond its maximum)
        jdbc.update("insert into outbox (id, aggregate_type, aggregate_id, topic, aggregate_version, created_at, attempts, order_id) "
                + "values (nextval('outbox_seq'), 'Order', ?, 'held', 99, now(), 1000000, ?)", pending, pending);
        awaitReplicated(recent);
        awaitReplicated(pending);

        // retention 1 day: an order closed just now is too recent
        assertFalse(job(1).run().containsKey(recent));
        // retention 0: the recent one goes, but never the open one, nor the one with a pending outbox row
        Map<String, Outcome> outcomes = job(0).run();
        assertEquals(Outcome.ARCHIVED, outcomes.get(recent));
        assertFalse(outcomes.containsKey(open));
        assertFalse(outcomes.containsKey(pending));
        assertEquals(1, count(jdbc, "orders", open));
        assertEquals(1, count(jdbc, "orders", pending));
        jdbc.update("delete from outbox where order_id = ?", pending);
    }

    @Test
    void refusesWhenTheReplicaIsDifferentThenArchivesOnceItMatches(CapturedOutput output) throws Exception {
        String orderId = closedFilledOrder();
        awaitReplicated(orderId);
        JdbcTemplate admin = replicaAdmin();
        String symbol = admin.queryForObject("select symbol from orders where order_id = ?", String.class, orderId);
        admin.update("update orders set symbol = 'XXXX' where order_id = ?", orderId);

        RetentionJob job = job(0);
        Map<String, Outcome> outcomes = job.run();
        assertEquals(Outcome.REPLICA_MISMATCH, outcomes.get(orderId));
        assertEquals(1, count(jdbc, "orders", orderId), "nothing deleted");
        long mismatches = outcomes.values().stream().filter(o -> o == Outcome.REPLICA_MISMATCH).count();
        assertEquals(mismatches, failures("replica-mismatch"), 0.0001);
        assertTrue(output.getOut().contains("order " + orderId + " not archived: replica-mismatch on orders"), "WARN names order and reason");

        admin.update("update orders set symbol = ? where order_id = ?", symbol, orderId);
        assertEquals(Outcome.ARCHIVED, job.run().get(orderId));
        assertTrue(goneFromPrimaryKeptOnReplica(orderId));
    }

    @Test
    void refusesWhenTheReplicaIsBehindThenArchivesOnceCaughtUp() throws Exception {
        JdbcTemplate admin = replicaAdmin();
        String subscription = replica.properties().subscription();
        admin.execute("alter subscription " + subscription + " disable");
        String orderId;
        try {
            orderId = closedFilledOrder();
            assertEquals(Outcome.REPLICA_MISMATCH, job(0).run().get(orderId));
            assertEquals(1, count(jdbc, "orders", orderId), "nothing deleted while the replica lacks the order");
        } finally {
            admin.execute("alter subscription " + subscription + " enable");
        }
        awaitReplicated(orderId);
        assertEquals(Outcome.ARCHIVED, job(0).run().get(orderId));
    }

    @Test
    void refusesWhenTheReplicaIsUnreachable(CapturedOutput output) throws Exception {
        String orderId = closedFilledOrder();
        awaitReplicated(orderId);
        JdbcTemplate unreachable = new JdbcTemplate(new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:1/none", "x", "x"));

        RetentionJob job = job(0, new ReplicaVerifier(jdbc, unreachable), new ArchivePreconditions(Optional.empty(), false));
        Map<String, Outcome> outcomes = job.run();
        assertEquals(Outcome.REPLICA_UNREACHABLE, outcomes.get(orderId));
        assertEquals(1, count(jdbc, "orders", orderId));
        // every order the run took failed the same way, and each is counted once
        assertTrue(outcomes.values().stream().allMatch(o -> o == Outcome.REPLICA_UNREACHABLE));
        assertEquals(outcomes.size(), failures("replica-unreachable"), 0.0001);
        assertTrue(output.getOut().contains("order " + orderId + " not archived: replica-unreachable"));
    }

    /**
     * An order that keeps failing must not hold its place in the batch: with a batch of one, a newer
     * eligible order is still archived on the next run, and the failed one is retried once there is room.
     */
    @Test
    void failingOrdersDoNotStarveNewerOnes() throws Exception {
        job(0).run(); // archive whatever earlier tests left eligible, so this run's batch is ours alone
        String stuck = closedFilledOrder();
        awaitReplicated(stuck);
        JdbcTemplate admin = replicaAdmin();
        String symbol = admin.queryForObject("select symbol from orders where order_id = ?", String.class, stuck);
        admin.update("update orders set symbol = 'XXXX' where order_id = ?", stuck);
        try {
            meters = new SimpleMeterRegistry();
            RetentionJob job = new RetentionJob(jdbc, transactionManager, leadership,
                    Optional.of(new ReplicaVerifier(jdbc, replica.jdbc())), new ArchivePreconditions(Optional.empty(), false),
                    meters, clock, true, 0, 1, false);
            assertEquals(Map.of(stuck, Outcome.REPLICA_MISMATCH), job.run());

            String newer = closedFilledOrder();
            awaitReplicated(newer);
            assertEquals(Map.of(newer, Outcome.ARCHIVED), job.run(), "the newer order goes first, not the failing one again");

            assertEquals(Map.of(stuck, Outcome.REPLICA_MISMATCH), job.run(), "with room again, the failed order is retried");
        } finally {
            admin.update("update orders set symbol = ? where order_id = ?", symbol, stuck);
        }
        assertEquals(Outcome.ARCHIVED, job(0).run().get(stuck));
    }

    /** An exception for one order fails that order only: the run goes on with the others. */
    @Test
    void anOrderSpecificErrorDoesNotAbortTheRun() throws Exception {
        String broken = closedFilledOrder();
        String fine = closedFilledOrder();
        awaitReplicated(broken);
        awaitReplicated(fine);
        AnalyticsHistoryCheck throwsForOne = id -> {
            if (id.equals(broken)) {
                throw new IllegalStateException("analytics unavailable for " + id);
            }
            return true;
        };
        Map<String, Outcome> outcomes =
                job(0, new ReplicaVerifier(jdbc, replica.jdbc()), new ArchivePreconditions(Optional.of(throwsForOne), true)).run();
        assertEquals(Outcome.ERROR, outcomes.get(broken));
        assertEquals(Outcome.ARCHIVED, outcomes.get(fine));
        assertEquals(1, count(jdbc, "orders", broken), "nothing of the failed order deleted");
        assertTrue(failures("error") >= 1);
        assertEquals(Outcome.ARCHIVED, job(0).run().get(broken));
    }

    @Test
    void analyticsPreconditionBlocksWhenRequired(CapturedOutput output) throws Exception {
        String orderId = closedFilledOrder();
        awaitReplicated(orderId);
        AnalyticsHistoryCheck notYet = id -> false;
        ReplicaVerifier verifier = new ReplicaVerifier(jdbc, replica.jdbc());

        RetentionJob blocked = job(0, verifier, new ArchivePreconditions(Optional.of(notYet), true));
        assertEquals(Outcome.PRECONDITION, blocked.run().get(orderId));
        assertEquals(1, count(jdbc, "orders", orderId));
        assertTrue(output.getOut().contains("order " + orderId + " not archived: precondition"));

        AnalyticsHistoryCheck confirmed = id -> true;
        assertEquals(Outcome.ARCHIVED, job(0, verifier, new ArchivePreconditions(Optional.of(confirmed), true)).run().get(orderId));
    }
}
