package org.example.oms.service.leadership;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * SPEC-0048 AC-3 and AC-6: exactly one instance holds each role. A leader that stops or loses its
 * session hands over, and an instance never reports a role whose lock it no longer holds.
 *
 * <p>Two {@link Leadership} objects stand for two application instances on one database.
 */
class LeadershipTest {

    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine").withDatabaseName("oms").withUsername("oms").withPassword("oms");

    @BeforeAll
    static void start() {
        postgres.start();
    }

    @AfterAll
    static void stop() {
        postgres.stop();
    }

    @Test
    void exactlyOneHoldsEachRoleAndReleaseHandsOver() {
        Leadership first = leadership();
        Leadership second = leadership();
        try {
            assertTrue(first.holds(Role.OUTBOX_RELAY));
            assertTrue(first.holds(Role.OUTBOX_RELAY), "held on later calls too");
            assertFalse(second.holds(Role.OUTBOX_RELAY), "the other instance does not");
            assertTrue(second.holds(Role.SCHEDULER), "roles are independent");
            assertFalse(first.holds(Role.SCHEDULER));
            assertEquals(Map.of(Role.OUTBOX_RELAY, true, Role.SCHEDULER, false), first.held());

            first.release();

            assertTrue(second.holds(Role.OUTBOX_RELAY), "takes over once the leader released");
            assertEquals(Map.of(Role.OUTBOX_RELAY, false, Role.SCHEDULER, false), first.held());
        } finally {
            first.release();
            second.release();
        }
    }

    @Test
    void aLeaderWhoseSessionDiesIsNoLongerLeader() throws Exception {
        Leadership first = leadership();
        Leadership second = leadership();
        try {
            assertTrue(first.holds(Role.OUTBOX_RELAY));
            terminateOtherSessionsHoldingAdvisoryLocks();

            assertFalse(first.held().get(Role.OUTBOX_RELAY), "a lock lost with its session is not reported as held");
            assertTrue(second.holds(Role.OUTBOX_RELAY), "the lock died with the session; the other takes it");
            assertFalse(first.holds(Role.OUTBOX_RELAY), "never two leaders: the first, on a new session, is a follower");
        } finally {
            first.release();
            second.release();
        }
    }

    /**
     * A stopped instance (shutting down, or a paused context) gives up its roles at once and takes no
     * new ones until it is started again: it must not hold a lock while its relay no longer drains.
     */
    @Test
    void aStoppedInstanceReleasesAndTakesNothingUntilStarted() {
        Leadership first = leadership();
        Leadership second = leadership();
        try {
            first.start();
            second.start();
            assertTrue(first.holds(Role.OUTBOX_RELAY));

            first.stop();

            assertFalse(first.isRunning());
            assertFalse(first.holds(Role.OUTBOX_RELAY), "stopped: holds nothing");
            assertTrue(second.holds(Role.OUTBOX_RELAY), "the other takes over at once");
            first.start();
            assertFalse(first.holds(Role.OUTBOX_RELAY), "started again, it is a follower");
        } finally {
            first.release();
            second.release();
        }
    }

    /** P-15: which roles an instance holds is a metric, 1 while held. */
    @Test
    void heldRolesAreAGauge() {
        Leadership leadership = leadership();
        var registry = new io.micrometer.core.instrument.simple.SimpleMeterRegistry();
        new LeadershipMetrics(leadership, registry);
        try {
            assertEquals(0.0, registry.get("oms.leadership.held").tag("role", "OUTBOX_RELAY").gauge().value());
            assertTrue(leadership.holds(Role.OUTBOX_RELAY));
            assertEquals(1.0, registry.get("oms.leadership.held").tag("role", "OUTBOX_RELAY").gauge().value());
            assertEquals(0.0, registry.get("oms.leadership.held").tag("role", "SCHEDULER").gauge().value());
        } finally {
            leadership.release();
        }
    }

    private static Leadership leadership() {
        return new Leadership(() -> DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
    }

    private static void terminateOtherSessionsHoldingAdvisoryLocks() throws SQLException {
        try (Connection admin = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                Statement statement = admin.createStatement()) {
            statement.execute("select pg_terminate_backend(pid) from pg_locks where locktype = 'advisory' and pid <> pg_backend_pid()");
        }
    }
}
