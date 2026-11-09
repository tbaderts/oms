package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import org.example.common.model.cmd.Execution;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.Order;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.oms.OmsApplication;
import org.example.oms.service.command.CommandDispatch;
import org.example.oms.service.command.CommandDispatcher;
import org.example.oms.service.command.CommandOrigin;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import jakarta.persistence.EntityManagerFactory;

/**
 * SPEC-0047 AC-7: one fill writes less than before. Its JDBC statements drop by at least the sequence
 * round trips saved, and the bytes it writes to the outbox drop by at least two order snapshots.
 *
 * <p>The baseline was measured by this test on the code before SPEC-0047 (task T-1) and is recorded
 * below and in the ticket's tasks.md. Kafka is off and the database is this class's own, so the
 * fill's outbox rows stay in the table to be measured.
 */
@SpringBootTest(classes = OmsApplication.class)
class FillWriteSetIntegrationTest {

    /** Measured before SPEC-0047 (T-1): prepared statements for one fill. */
    static final long BASELINE_STATEMENTS = 20;
    /** Measured before SPEC-0047 (T-1): sequence calls for one fill. */
    static final long BASELINE_NEXTVALS = 7;
    /** Measured before SPEC-0047 (T-1): bytes of the fill's outbox rows. */
    static final long BASELINE_OUTBOX_BYTES = 3557;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        String url = AbstractKafkaPostgresIntegrationTest.isolatedDatabaseUrl("writeset");
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", AbstractKafkaPostgresIntegrationTest.postgres::getUsername);
        registry.add("spring.datasource.password", AbstractKafkaPostgresIntegrationTest.postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.jpa.properties.hibernate.generate_statistics", () -> "true");
        registry.add("spring.jpa.properties.hibernate.session_factory.statement_inspector", SqlCounter.class::getName);
        registry.add("kafka.enabled", () -> "false");
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "3");
    }

    @Autowired CommandDispatcher dispatcher;
    @Autowired EntityManagerFactory entityManagerFactory;
    @Autowired JdbcTemplate jdbc;

    @Test
    void oneFillWritesLess() {
        String orderId = liveOrder();
        dispatch(fill(orderId, "WARMUP-" + UUID.randomUUID(), "10")); // first fill pays one-off costs

        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        SqlCounter.reset();
        CommandDispatch outcome = dispatch(fill(orderId, "E-" + UUID.randomUUID(), "10"));
        long statements = statistics.getPrepareStatementCount();
        long nextvals = SqlCounter.nextvals();

        long version = ((CommandDispatch.Applied) outcome).eventVersion();
        long outboxBytes = jdbc.queryForObject(
                "select coalesce(sum(pg_column_size(o.*)), 0) from outbox o where aggregate_id = ? and aggregate_version = ?",
                Long.class, orderId, version);
        long snapshotBytes = jdbc.queryForObject(
                "select pg_column_size(order_snapshot) from order_events where order_id = ? and version = ?",
                Long.class, orderId, version);

        System.out.printf("SPEC-0047 write set of one fill: statements=%d nextvals=%d outboxBytes=%d snapshotBytes=%d%n",
                statements, nextvals, outboxBytes, snapshotBytes);

        assertTrue(BASELINE_STATEMENTS > 0, "baseline recorded (T-1)");
        assertTrue(statements <= BASELINE_STATEMENTS - (BASELINE_NEXTVALS - nextvals),
                "statements " + statements + " at most the baseline " + BASELINE_STATEMENTS
                        + " minus the sequence round trips saved (" + BASELINE_NEXTVALS + " -> " + nextvals + ")");
        assertTrue(outboxBytes <= BASELINE_OUTBOX_BYTES - 2 * snapshotBytes,
                "outbox bytes " + outboxBytes + " at least two snapshots (" + snapshotBytes + " each) below the baseline "
                        + BASELINE_OUTBOX_BYTES);
    }

    private String liveOrder() {
        Order order = new Order()
                .clOrdId("CL-" + UUID.randomUUID()).sessionId("SES-WS").account("ACC-WS").symbol("AAPL")
                .side(Side.BUY).ordType(OrdType.LIMIT).price(new BigDecimal("170")).orderQty(new BigDecimal("100"))
                .timeInForce(TimeInForce.DAY);
        String orderId = dispatch(new OrderCreateCmd().type("OrderCreateCmd").order(order)).orderId();
        dispatch(new OrderAcceptCmd().orderId(orderId).type("OrderAcceptCmd"));
        return orderId;
    }

    private static ExecutionCreateCmd fill(String orderId, String execId, String qty) {
        return new ExecutionCreateCmd().type("ExecutionCreateCmd").execution(new Execution()
                .execId(execId).orderId(orderId).lastQty(new BigDecimal(qty)).lastPx(new BigDecimal("170")).execType("F"));
    }

    private CommandDispatch dispatch(org.example.common.model.cmd.Command command) {
        CommandDispatch outcome = dispatcher.dispatch(command, CommandOrigin.rest(Instant.now()));
        assertTrue(outcome instanceof CommandDispatch.Applied, "applied: " + outcome);
        assertEquals(CommandDispatch.Applied.class, outcome.getClass());
        return outcome;
    }
}
