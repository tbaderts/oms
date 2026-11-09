package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.example.oms.service.reconciliation.EventLogReconciler;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.micrometer.core.instrument.MeterRegistry;

/**
 * SPEC-0049 AC-6 and AC-7: the reconciler finds an order whose row was changed without an event and
 * an order with a missing version, reports both, and reads zero once they are repaired. One run
 * samples at most the configured number of orders.
 *
 * <p>Runs in a world of its own with small sample sizes (3 recent, 2 random); the schedule is off
 * and the test calls {@link EventLogReconciler#reconcile} itself.
 */
class EventLogReconcilerIntegrationTest extends AbstractFillFlowIntegrationTest {

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        isolate("reconcile", "commands-reconcile");
        registry.add("spring.kafka.consumer.group-id", () -> "oms-reconcile");
        registry.add("oms.reconciliation.recent", () -> "3");
        registry.add("oms.reconciliation.random", () -> "2");
    }

    @Autowired EventLogReconciler reconciler;
    @Autowired JdbcTemplate jdbc;
    @Autowired MeterRegistry meterRegistry;

    /** AC-6. */
    @Test
    void findsAnInconsistencyAndAGapThenClears() throws Exception {
        String healthy = createLiveOrder();
        String edited = createLiveOrder();
        String gapped = createLiveOrder();
        assertEquals(201, postFill(gapped + "-E1", gapped, "10", null)); // versions 1, 2, 3

        EventLogReconciler.Result clean = reconciler.reconcile();
        assertTrue(clean.inconsistent().isEmpty() && clean.gaps().isEmpty(), "a healthy log reads zero: " + clean);
        assertEquals(0.0, gauge("oms.event_log.inconsistent"));
        assertEquals(0.0, gauge("oms.event_log.gaps"));

        jdbc.update("update orders set cum_qty = 7 where order_id = ?", edited);
        jdbc.execute("drop table if exists reconcile_hold");
        jdbc.update("create table reconcile_hold as select * from order_events where order_id = '" + gapped + "' and version = 2");
        jdbc.update("delete from order_events where order_id = ? and version = 2", gapped);

        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        Logger logger = (Logger) LoggerFactory.getLogger(EventLogReconciler.class);
        logger.addAppender(logs);
        EventLogReconciler.Result found;
        try {
            found = reconciler.reconcile();
        } finally {
            logger.detachAppender(logs);
        }
        assertEquals(List.of(edited), found.inconsistent(), found.toString());
        assertEquals(List.of(gapped), found.gaps(), found.toString());
        assertEquals(1.0, gauge("oms.event_log.inconsistent"));
        assertEquals(1.0, gauge("oms.event_log.gaps"));
        List<String> warnings = new ArrayList<>();
        logs.list.stream().filter(e -> e.getLevel() == Level.WARN).forEach(e -> warnings.add(e.getFormattedMessage()));
        assertTrue(warnings.stream().anyMatch(w -> w.contains(edited) && w.contains("cumQty")),
                "a WARN names the inconsistent order and its field: " + warnings);
        assertTrue(warnings.stream().anyMatch(w -> w.contains(gapped) && w.contains("missing versions [2]")),
                "a WARN names the order with the gap and its missing version: " + warnings);
        assertTrue(warnings.stream().noneMatch(w -> w.contains(healthy)), "the healthy order is not reported");

        jdbc.update("update orders set cum_qty = 0 where order_id = ?", edited);
        jdbc.update("insert into order_events select * from reconcile_hold");
        jdbc.execute("drop table reconcile_hold");

        EventLogReconciler.Result repaired = reconciler.reconcile();
        assertTrue(repaired.inconsistent().isEmpty() && repaired.gaps().isEmpty(), "repaired: " + repaired);
        assertEquals(0.0, gauge("oms.event_log.inconsistent"));
        assertEquals(0.0, gauge("oms.event_log.gaps"));
    }

    /** AC-7: with 3 recent and 2 random, one run reads at most 5 orders, however many exist. */
    @Test
    void samplesAtMostTheConfiguredOrders() throws Exception {
        for (int i = 0; i < 8; i++) {
            createLiveOrder();
        }
        double before = meterRegistry.get("oms.event_log.sampled").counter().count();

        EventLogReconciler.Result run = reconciler.reconcile();

        assertTrue(run.sampled() <= 5 && run.sampled() >= 3, "at most 3 recent + 2 random: " + run.sampled());
        assertEquals(run.sampled(), meterRegistry.get("oms.event_log.sampled").counter().count() - before, 0.0);
    }

    private double gauge(String name) {
        return meterRegistry.get(name).gauge().value();
    }
}
