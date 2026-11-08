package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

import org.example.oms.OmsApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

import liquibase.Scope;
import liquibase.command.CommandScope;
import liquibase.resource.ClassLoaderResourceAccessor;

/**
 * SPEC-0044 AC-1: fills recorded before the execution lifecycle columns existed get their
 * {@code exec_id}, status, order version and root order id.
 *
 * <p>The database is migrated to the tag just before the change, legacy rows are inserted, and only
 * then does Spring start and apply the rest of the changelog, as a real upgrade would. One fill has
 * its command stored (matched by the command's execId); the other is a REST fill from before
 * SPEC-0018 with no command (matched by position).
 */
@SpringBootTest(classes = OmsApplication.class)
class ExecutionLifecycleMigrationIntegrationTest {

    private static final String ORDER_ID = "ORD-LEGACY-EXEC";
    private static final String TREE_ORDER_ID = "ORD-LEGACY-CHILD";
    private static final String ROOT_ORDER_ID = "ORD-LEGACY-ROOT";
    private static final String ANOMALY_ORDER_ID = "ORD-LEGACY-ANOMALY";
    private static final String PROJECTED_ORDER_ID = "ORD-LEGACY-PROJECTED";

    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("oms")
                    .withUsername("oms")
                    .withPassword("oms");

    static {
        postgres.start();
        migrateToTagAndSeedLegacyFills();
    }

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("kafka.enabled", () -> "false");
    }

    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void legacyFillsAreBackfilled() {
        List<Map<String, Object>> events = jdbcTemplate.queryForList(
                "select version, exec_id from order_events where order_id = ? order by version", ORDER_ID);
        assertEquals(4, events.size());
        assertNull(events.get(0).get("exec_id"), "NEW_ORDER is about no execution");
        assertNull(events.get(1).get("exec_id"), "ACK is about no execution");
        assertEquals("EX-1", events.get(2).get("exec_id"), "from the stored ExecutionCreateCmd");
        assertEquals("EX-2", events.get(3).get("exec_id"), "a fill without a command, matched by position");

        List<Map<String, Object>> executions = jdbcTemplate.queryForList(
                "select execid, status, order_version, root_order_id, exec_ref_id, busted_at_version"
                        + " from executions where order_id = ? order by id",
                ORDER_ID);
        assertEquals(2, executions.size());
        assertExecution(executions.get(0), "EX-1", 3L, ORDER_ID);
        assertExecution(executions.get(1), "EX-2", 4L, ORDER_ID);

        Map<String, Object> child = jdbcTemplate.queryForMap(
                "select execid, status, order_version, root_order_id, exec_ref_id, busted_at_version"
                        + " from executions where order_id = ?",
                TREE_ORDER_ID);
        assertExecution(child, "EX-C1", 2L, ROOT_ORDER_ID);

        // An order whose executions do not line up with its fill events (an orphan execution E0 with
        // no fill event): the uncommanded fill cannot be matched by position with confidence, so it
        // keeps a null exec_id (and a rebuild names it) instead of being given an execution that
        // another event already names.
        List<Map<String, Object>> anomalous = jdbcTemplate.queryForList(
                "select version, exec_id from order_events where order_id = ? order by version", ANOMALY_ORDER_ID);
        assertEquals("A-E1", anomalous.get(1).get("exec_id"), "matched from its stored command");
        assertNull(anomalous.get(2).get("exec_id"), "ambiguous by position: left unmatched");
        assertEquals(
                0,
                jdbcTemplate.queryForObject(
                        "select count(*) from (select order_id, exec_id from order_events where exec_id is not null"
                                + " group by order_id, exec_id having count(*) > 1) d",
                        Integer.class),
                "no execution is named by two fill events");

        // An execution whose fill event is gone: only the projection knows its version.
        assertEquals(
                7L,
                jdbcTemplate.queryForObject(
                        "select order_version from executions where order_id = ? and execid = 'P-1'", Long.class,
                        PROJECTED_ORDER_ID));

        assertTrue(
                jdbcTemplate.queryForObject(
                        "select indexdef from pg_indexes where indexname = 'idx_order_events_order_id_exec_id'",
                        String.class)
                        .contains("(order_id, exec_id)"),
                "the (order_id, exec_id) index exists");
    }

    private static void assertExecution(Map<String, Object> row, String execId, long orderVersion, String rootOrderId) {
        assertEquals(execId, row.get("execid"));
        assertEquals("APPLIED", row.get("status"), execId);
        assertEquals(orderVersion, ((Number) row.get("order_version")).longValue(), execId);
        assertEquals(rootOrderId, row.get("root_order_id"), execId);
        assertNull(row.get("exec_ref_id"), execId);
        assertNull(row.get("busted_at_version"), execId);
    }

    private static void migrateToTagAndSeedLegacyFills() {
        try {
            Scope.child(
                    Map.of(Scope.Attr.resourceAccessor.name(), new ClassLoaderResourceAccessor()),
                    () -> new CommandScope("updateToTag")
                            .addArgumentValue("changelogFile", "db/changelog/db.changelog-master.yaml")
                            .addArgumentValue("url", postgres.getJdbcUrl())
                            .addArgumentValue("username", postgres.getUsername())
                            .addArgumentValue("password", postgres.getPassword())
                            .addArgumentValue("tag", "before-011-execution-lifecycle")
                            .execute());

            try (Connection connection =
                            DriverManager.getConnection(
                                    postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                    Statement statement = connection.createStatement()) {
                statement.execute(
                        "insert into orders (id, order_id, root_order_id, tx_nr, state) values "
                                + "(nextval('order_seq'), '" + ORDER_ID + "', null, 4, 'FILLED'), "
                                + "(nextval('order_seq'), '" + TREE_ORDER_ID + "', '" + ROOT_ORDER_ID + "', 2, 'LIVE')");
                // The fill command in the shape the appender stores it (the command API's JSON).
                String fillCommand = "'{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"commandId\":\"f-1\","
                        + "\"execution\":{\"execId\":\"EX-1\",\"orderId\":\"" + ORDER_ID + "\",\"lastQty\":40,"
                        + "\"lastPx\":171.95,\"execType\":\"F\"}}'::jsonb";
                statement.execute(
                        "insert into order_events (id, order_id, version, event, transaction, resulting_state, time_stamp) values "
                                + "(nextval('order_event_seq'), '" + ORDER_ID + "', 1, 'NEW_ORDER', null, 'UNACK', now()), "
                                + "(nextval('order_event_seq'), '" + ORDER_ID + "', 2, 'ACK', null, 'LIVE', now()), "
                                + "(nextval('order_event_seq'), '" + ORDER_ID + "', 3, 'PARTIAL_FILL', " + fillCommand + ", 'LIVE', now()), "
                                + "(nextval('order_event_seq'), '" + ORDER_ID + "', 4, 'FILL', null, 'FILLED', now()), "
                                + "(nextval('order_event_seq'), '" + TREE_ORDER_ID + "', 1, 'NEW_ORDER', null, 'UNACK', now()), "
                                + "(nextval('order_event_seq'), '" + TREE_ORDER_ID + "', 2, 'PARTIAL_FILL', null, 'LIVE', now())");
                statement.execute(
                        "insert into executions (id, order_id, execid, last_qty, last_px, exec_type) values "
                                + "(nextval('execution_seq'), '" + ORDER_ID + "', 'EX-1', 40, 171.95, 'F'), "
                                + "(nextval('execution_seq'), '" + ORDER_ID + "', 'EX-2', 60, 172.00, 'F'), "
                                + "(nextval('execution_seq'), '" + TREE_ORDER_ID + "', 'EX-C1', 10, 50.00, 'F')");
                // Only EX-1 and P-1 were projected: the projection is the first source of their version.
                // P-1's fill event is not in the log, so only the projection can give its version.
                statement.execute(
                        "insert into order_execution_view (id, order_id, execid, order_version, projected_at) values "
                                + "(nextval('order_execution_view_seq'), '" + ORDER_ID + "', 'EX-1', 3, now()), "
                                + "(nextval('order_execution_view_seq'), '" + PROJECTED_ORDER_ID + "', 'P-1', 7, now())");
                statement.execute(
                        "insert into executions (id, order_id, execid, last_qty, last_px, exec_type) values "
                                + "(nextval('execution_seq'), '" + PROJECTED_ORDER_ID + "', 'P-1', 5, 10.00, 'F')");

                // Anomaly: an orphan execution A-E0 (no fill event), then A-E1 filled with its command
                // stored (v2) and A-E2 filled without (v3). By position over all rows, v3 would be the
                // second execution, A-E1, which v2 already names.
                String anomalyCommand = "'{\"type\":\"ExecutionCreateCmd\",\"version\":\"1.0.0\",\"commandId\":\"f-a1\","
                        + "\"execution\":{\"execId\":\"A-E1\",\"orderId\":\"" + ANOMALY_ORDER_ID + "\",\"lastQty\":1,"
                        + "\"lastPx\":10,\"execType\":\"F\"}}'::jsonb";
                statement.execute(
                        "insert into orders (id, order_id, root_order_id, tx_nr, state) values "
                                + "(nextval('order_seq'), '" + ANOMALY_ORDER_ID + "', null, 3, 'LIVE'), "
                                + "(nextval('order_seq'), '" + PROJECTED_ORDER_ID + "', null, 7, 'LIVE')");
                statement.execute(
                        "insert into executions (id, order_id, execid, last_qty, last_px, exec_type) values "
                                + "(nextval('execution_seq'), '" + ANOMALY_ORDER_ID + "', 'A-E0', 1, 10.00, 'F'), "
                                + "(nextval('execution_seq'), '" + ANOMALY_ORDER_ID + "', 'A-E1', 1, 10.00, 'F'), "
                                + "(nextval('execution_seq'), '" + ANOMALY_ORDER_ID + "', 'A-E2', 1, 10.00, 'F')");
                statement.execute(
                        "insert into order_events (id, order_id, version, event, transaction, resulting_state, time_stamp) values "
                                + "(nextval('order_event_seq'), '" + ANOMALY_ORDER_ID + "', 1, 'NEW_ORDER', null, 'UNACK', now()), "
                                + "(nextval('order_event_seq'), '" + ANOMALY_ORDER_ID + "', 2, 'PARTIAL_FILL', " + anomalyCommand + ", 'LIVE', now()), "
                                + "(nextval('order_event_seq'), '" + ANOMALY_ORDER_ID + "', 3, 'PARTIAL_FILL', null, 'LIVE', now())");
            }
        } catch (Exception e) {
            throw new IllegalStateException("Could not prepare the legacy database", e);
        }
    }
}
