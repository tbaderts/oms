package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;

import org.example.oms.service.leadership.Leadership;
import org.example.oms.service.leadership.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0052 AC-9: with two instances in one world, only the scheduler leader archives. Both run the
 * retention job on a short timer; the follower's archived counter stays 0.
 */
class RetentionLeadershipIntegrationTest extends AbstractArchiveIntegrationTest {

    private static final String WORLD = "retention_lead";

    /** The retention settings both instances run with: archive at once, every 300 ms. */
    private static final Map<String, Object> RETENTION = Map.of(
            "oms.retention.enabled", "true",
            "oms.retention.closed-order-days", "0",
            "oms.retention.interval-ms", "300",
            "oms.retention.initial-delay-ms", "0");

    /** Frees this world's replication worker and slot for the classes that run after it. */
    @org.junit.jupiter.api.AfterAll
    static void dropSubscription() {
        ReplicaTestSupport.dropSubscription("retention_lead");
    }

    @DynamicPropertySource
    static void world(DynamicPropertyRegistry registry) {
        archiveWorld(registry, WORLD);
        RETENTION.forEach((k, v) -> registry.add(k, () -> v));
    }

    @Autowired Environment environment;
    @Autowired MeterRegistry meters;
    @Autowired Leadership leadership;

    private static double archived(MeterRegistry registry) {
        var counter = registry.find("oms.retention.archived").counter();
        return counter == null ? 0 : counter.count();
    }

    @Test
    void onlyTheSchedulerLeaderArchives() throws Exception {
        Map<String, Object> settings = new HashMap<>(RETENTION);
        for (String key : new String[] {"oms.replica.enabled", "oms.replica.url", "oms.replica.username", "oms.replica.password",
                "oms.replica.primary-conninfo", "oms.replica.subscription"}) {
            settings.put(key, environment.getProperty(key));
        }
        try (ConfigurableApplicationContext second = SecondInstance.start(environment, settings)) {
            MeterRegistry secondMeters = second.getBean(MeterRegistry.class);
            Leadership secondLeadership = second.getBean(Leadership.class);

            String orderId = closedFilledOrder();
            // Not awaitReplicated: with retention at 0 days the leader archives the order as soon as
            // the replica holds it, and once archived the primary no longer matches the replica. The
            // archive itself proves the replica was verified; the assertion below checks it kept the rows.
            long deadline = System.nanoTime() + REPLICATION_TIMEOUT.toNanos();
            while (count(jdbc, "orders", orderId) != 0) {
                if (System.nanoTime() > deadline) {
                    throw new AssertionError("Timed out after " + REPLICATION_TIMEOUT + " waiting for: " + orderId + " archived");
                }
                Thread.sleep(100);
            }
            assertTrue(count(replica.jdbc(), "orders", orderId) == 1, "the replica keeps the archived order");

            boolean firstLeads = leadership.holds(Role.SCHEDULER);
            boolean secondLeads = secondLeadership.holds(Role.SCHEDULER);
            assertTrue(firstLeads ^ secondLeads, "exactly one instance holds the scheduler role");
            MeterRegistry leaderMeters = firstLeads ? meters : secondMeters;
            MeterRegistry followerMeters = firstLeads ? secondMeters : meters;
            assertTrue(archived(leaderMeters) >= 1, "the leader archived");
            assertEquals(0.0, archived(followerMeters), "the follower archived nothing");
        }
    }
}
