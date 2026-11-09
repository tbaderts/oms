package org.example.oms.replay;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import javax.sql.DataSource;

import org.example.common.model.cmd.Command;
import org.example.oms.OmsApplication;
import org.example.oms.service.OutboxRelay;
import org.example.oms.service.command.CommandDispatch;
import org.example.oms.service.command.CommandDispatcher;
import org.example.oms.service.command.CommandOrigin;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * SPEC-0024 AC-1, AC-2, AC-3: a command history recorded through the real command path replays
 * into a fresh database with identical snapshots; a history today's code does not reproduce fails
 * with a named difference; legacy rows replay under the upcasting rule with a warning.
 *
 * <p>The test context's database is the source. Each test replays into a database of its own,
 * created empty in the same container. Kafka is off on both sides: replay needs no broker.
 */
@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class ReplayHarnessIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("oms")
            .withUsername("oms")
            .withPassword("oms");

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("kafka.enabled", () -> "false");
        registry.add("oms.end-of-day.enabled", () -> "false");
    }

    private static final ObjectMapper JSON = JsonMapper.builder().build();
    private static final AtomicInteger TARGETS = new AtomicInteger();

    @Autowired CommandDispatcher commandDispatcher;
    @Autowired DataSource source;
    @Autowired JdbcTemplate jdbc;

    private ReplayTarget target;

    @BeforeEach
    void emptySourceAndStartTarget() {
        List<String> tables = jdbc.queryForList(
                "select tablename from pg_tables where schemaname = 'public' and tablename not like 'databasechangelog%'",
                String.class);
        jdbc.execute("truncate table " + String.join(", ", tables) + " cascade");
        target = ReplayTarget.start(freshDatabase(), postgres.getUsername(), postgres.getPassword());
    }

    @AfterEach
    void stopTarget() {
        if (target != null) {
            target.close();
        }
    }

    /** AC-1: create → accept → split fills → cancel, and a fully filled order, replay identically. */
    @Test
    void replaysCommandHistoryIntoFreshDatabaseWithZeroDifferences() {
        List<String> orders = recordHistory();

        ReplayResult result = ReplayHarness.replay(source, target);

        result.assertNoDifferences();
        assertFalse(result.failed());
        assertEquals(9, result.recorded().events().size(), "5 events for the cancelled order, 4 for the filled one");
        assertEquals(9, result.diff().compared(), result.lines().toString());
        assertEquals(result.recorded().events().size(), result.replayed().events().size());
        assertEquals(orders, result.replayed().events().stream().map(StoredEvent::orderId).distinct().toList(),
                "the replayed orders keep their recorded ids");
        assertTrue(result.legacyOrderIds().isEmpty(), "rows written today carry schema_version");
        assertNull(target.context().getBeanProvider(OutboxRelay.class).getIfAvailable(),
                "the replay target publishes nothing: it has no outbox relay");
    }

    /**
     * SPEC-0047: with pooled ids, an order's later event can have a smaller id than an earlier one
     * (two instances draw ids from different blocks). The replay still applies each order's events
     * in version order: here the partial order's two fills swap ids.
     */
    @Test
    void replayHoldsBackAVersionWhoseIdComesFirst() {
        List<String> orders = recordHistory();
        String partial = orders.getFirst();
        long v3 = jdbc.queryForObject("select id from order_events where order_id = ? and version = 3", Long.class, partial);
        long v4 = jdbc.queryForObject("select id from order_events where order_id = ? and version = 4", Long.class, partial);
        jdbc.update("update order_events set id = -1 where id = ?", v3);
        jdbc.update("update order_events set id = ? where id = ?", v3, v4);
        jdbc.update("update order_events set id = ? where id = -1", v4);

        ReplayResult result = ReplayHarness.replay(source, target);

        result.assertNoDifferences();
        assertFalse(result.failed(), result.lines().toString());
        assertEquals(9, result.diff().compared(), result.lines().toString());
        assertEquals(orders, result.replayed().events().stream().map(StoredEvent::orderId).distinct().toList(),
                "the replayed orders keep their recorded ids");
    }

    /** AC-2: a recorded snapshot today's code does not reproduce fails the replay, naming the field. */
    @Test
    void failsWithDiffWhenReplayDiverges() {
        String orderId = recordHistory().getFirst();
        jdbc.update("update order_events set order_snapshot = jsonb_set(order_snapshot, '{cumQty}', '999')"
                + " where order_id = ? and version = 3", orderId);

        ReplayResult result = ReplayHarness.replay(source, target);

        assertTrue(result.failed());
        assertTrue(result.diff().items().contains(new DiffItem(orderId, 3, "cumQty", "999", "30")),
                result.lines().toString());
        AssertionError failure = assertThrows(AssertionError.class, result::assertNoDifferences);
        assertTrue(failure.getMessage().contains(orderId + " v3 cumQty"), failure.getMessage());
    }

    /** AC-3: rows without schema_version replay under the upcasting rule, with a warning naming the orders. */
    @Test
    void replaysLegacyRowsWithoutSchemaVersionAndWarns() {
        List<String> orders = recordHistory();
        jdbc.update("update order_events set schema_version = null");
        ListAppender<ILoggingEvent> logs = captureHarnessLog();

        ReplayResult result;
        try {
            result = ReplayHarness.replay(source, target);
        } finally {
            ((Logger) LoggerFactory.getLogger(ReplayHarness.class)).detachAppender(logs);
        }

        result.assertNoDifferences();
        assertEquals(orders, result.legacyOrderIds());
        ILoggingEvent warning = logs.list.stream()
                .filter(event -> event.getLevel() == Level.WARN)
                .findFirst()
                .orElseThrow(() -> new AssertionError("no legacy warning was logged"));
        orders.forEach(orderId -> assertTrue(warning.getFormattedMessage().contains(orderId), warning.getFormattedMessage()));
        assertTrue(result.replayed().events().stream().noneMatch(StoredEvent::legacy),
                "replayed rows are stamped with the current version");
    }

    /**
     * Records two orders through the command path: one created, accepted, filled 30 then 20 of 100,
     * then cancelled (5 events); one created, accepted and filled 60 then 40 of 100 (4 events).
     */
    private List<String> recordHistory() {
        String partial = create("RPL-1");
        apply("""
                {"type":"OrderAcceptCmd","orderId":"%s"}""".formatted(partial));
        apply(fill(partial, "RPL-1-X1", "30"));
        apply(fill(partial, "RPL-1-X2", "20"));
        apply("""
                {"type":"OrderCancelCmd","orderId":"%s"}""".formatted(partial));

        String filled = create("RPL-2");
        apply("""
                {"type":"OrderAcceptCmd","orderId":"%s"}""".formatted(filled));
        apply(fill(filled, "RPL-2-X1", "60"));
        apply(fill(filled, "RPL-2-X2", "40"));
        return List.of(partial, filled);
    }

    private String create(String clOrdId) {
        CommandDispatch.Applied applied = apply("""
                {"type":"OrderCreateCmd","version":"1.0.0","order":{
                  "sessionId":"replay-session","clOrdId":"%s","account":"replay-account","handlInst":"AUTO",
                  "securityIdSource":"ISIN","securityId":"US0378331005","symbol":"AAPL","side":"BUY",
                  "ordType":"LIMIT","price":172.06,"priceType":"PER_UNIT","orderQty":100,"timeInForce":"DAY",
                  "exDestination":"XNAS","settlCurrency":"USD"}}""".formatted(clOrdId));
        return applied.orderId();
    }

    private static String fill(String orderId, String execId, String qty) {
        return """
                {"type":"ExecutionCreateCmd","execution":{
                  "execId":"%s","orderId":"%s","execType":"F","lastQty":%s,"lastPx":171.90}}"""
                .formatted(execId, orderId, qty);
    }

    private CommandDispatch.Applied apply(String json) {
        Command command = JSON.readValue(json, Command.class);
        CommandDispatch outcome = commandDispatcher.dispatch(command, CommandOrigin.rest(Instant.now()));
        return assertInstanceOf(CommandDispatch.Applied.class, outcome, "recording " + json + " -> " + outcome);
    }

    private static ListAppender<ILoggingEvent> captureHarnessLog() {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(ReplayHarness.class)).addAppender(appender);
        return appender;
    }

    /** A new, empty database in the container, for one replay. */
    private static String freshDatabase() {
        String name = "oms_replay_" + TARGETS.incrementAndGet();
        try (Connection connection = DriverManager.getConnection(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                Statement statement = connection.createStatement()) {
            statement.execute("drop database if exists " + name);
            statement.execute("create database " + name);
        } catch (SQLException e) {
            throw new IllegalStateException("Could not create database " + name, e);
        }
        return postgres.getJdbcUrl().replaceAll("/oms(\\?|$)", "/" + name + "$1");
    }
}
