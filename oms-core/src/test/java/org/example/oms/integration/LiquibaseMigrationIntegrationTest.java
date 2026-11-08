package org.example.oms.integration;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.example.oms.OmsApplication;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class LiquibaseMigrationIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
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
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void liquibaseAppliesBaselineSchema() {
        assertTableExists("databasechangelog");
        assertTableExists("orders");
        assertTableExists("executions");
        assertTableExists("order_events");
        assertTableExists("outbox");
        assertTableDoesNotExist("order_messages");
        assertConstraintExists("uq_orders_session_cl_ord_id");
        assertConstraintExists("uq_executions_order_id_execid");
        assertConstraintExists("uq_order_events_order_id_version");
        assertConstraintExists("uq_order_events_order_id_command_id");

        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from databasechangelog where id = ?",
                Integer.class,
                "001-create-sequences");
        assertEquals(1, count);
    }

    /**
     * Order state is persisted by name, not by enum ordinal. Persisting it as an ordinal meant
     * inserting a value into the State enum would silently relabel every stored order.
     */
    @Test
    void orderStateColumnsArePersistedAsText() {
        assertColumnType("orders", "state", "character varying");
        assertColumnType("orders", "cancel_state", "character varying");
    }

    /** tx_nr backs the JPA @Version column, so it must be present and non-null on every row. */
    @Test
    void orderVersionColumnIsNotNull() {
        String nullable = jdbcTemplate.queryForObject(
                "select is_nullable from information_schema.columns "
                        + "where table_schema = 'public' and table_name = 'orders' and column_name = 'tx_nr'",
                String.class);
        assertEquals("NO", nullable);
    }

    /** SPEC-0020: the outbox carries any typed payload, and the fill projection has its table (renamed in SPEC-0045). */
    @Test
    void projectionSchemaIsApplied() {
        assertColumnType("outbox", "payload", "bytea");
        assertColumnType("outbox", "payload_type", "character varying");
        assertTableExists("order_execution_projection");
        assertTableDoesNotExist("order_execution_view");
        assertConstraintExists("uq_order_execution_projection_order_id_execid");
        assertColumnType("order_execution_projection", "trade_date", "date");
        String nullable = jdbcTemplate.queryForObject(
                "select is_nullable from information_schema.columns "
                        + "where table_schema = 'public' and table_name = 'order_execution_projection' and column_name = 'order_version'",
                String.class);
        assertEquals("NO", nullable);
    }

    /** SPEC-0039: every price and quantity column has the one precision of every layer. */
    @Test
    void priceAndQuantityColumnsAreNumeric18By8() {
        Map<String, List<String>> columns = Map.of(
                "orders", List.of("order_qty", "cash_order_qty", "place_qty", "cum_qty", "leaves_qty", "alloc_qty",
                        "strike_price", "price", "stop_px"),
                "executions", List.of("avg_px", "cum_qty", "last_px", "last_qty", "leaves_qty", "day_order_qty",
                        "day_cum_qty", "day_avg_px"),
                "order_execution_projection", List.of("price", "order_qty", "last_qty", "last_px", "cum_qty", "leaves_qty",
                        "avg_px"));
        columns.forEach((table, names) -> names.forEach(column -> assertEquals(
                "18,8",
                jdbcTemplate.queryForObject(
                        "select numeric_precision || ',' || numeric_scale from information_schema.columns "
                                + "where table_schema = 'public' and table_name = ? and column_name = ?",
                        String.class, table, column),
                () -> table + "." + column)));
    }

    /** SPEC-0026: the relay's held-aggregate check probes the outbox by topic and aggregate id. */
    @Test
    void outboxHasTopicAggregateIndex() {
        String definition = jdbcTemplate.queryForObject(
                "select coalesce(max(indexdef), '') from pg_indexes "
                        + "where schemaname = 'public' and tablename = 'outbox' and indexname = 'idx_outbox_topic_aggregate_id'",
                String.class);
        assertTrue(definition.contains("(topic, aggregate_id)"), () -> "index definition: " + definition);
    }

    /** SPEC-0046: every command attempt is logged; read per order in received order. */
    @Test
    void commandLogTableIsApplied() {
        assertTableExists("command_log");
        assertColumnType("command_log", "received_at", "timestamp with time zone");
        assertColumnType("command_log", "event_version", "bigint");
        for (String column : List.of("type", "received_at", "source", "outcome", "logged_at")) {
            assertEquals(
                    "NO",
                    jdbcTemplate.queryForObject(
                            "select is_nullable from information_schema.columns where table_schema = 'public'"
                                    + " and table_name = 'command_log' and column_name = ?",
                            String.class,
                            column),
                    column);
        }
        String index = jdbcTemplate.queryForObject(
                "select coalesce(max(indexdef), '') from pg_indexes where schemaname = 'public'"
                        + " and indexname = 'idx_command_log_order_id_received_at'",
                String.class);
        assertTrue(index.contains("(order_id, received_at)"), () -> "index definition: " + index);
    }

    private void assertTableExists(String tableName) {
        Integer exists = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.tables where table_schema = 'public' and table_name = ?",
                Integer.class,
                tableName);
        assertEquals(1, exists, () -> "Expected table to exist: " + tableName);
    }

    private void assertTableDoesNotExist(String tableName) {
        Integer exists = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.tables where table_schema = 'public' and table_name = ?",
                Integer.class,
                tableName);
        assertEquals(0, exists, () -> "Expected table to have been dropped: " + tableName);
    }

    private void assertColumnType(String tableName, String columnName, String expectedType) {
        String actual = jdbcTemplate.queryForObject(
                "select data_type from information_schema.columns "
                        + "where table_schema = 'public' and table_name = ? and column_name = ?",
                String.class,
                tableName,
                columnName);
        assertEquals(expectedType, actual, () -> tableName + "." + columnName);
    }

    private void assertConstraintExists(String constraintName) {
        Integer exists = jdbcTemplate.queryForObject(
                "select count(*) from pg_constraint where conname = ?",
                Integer.class,
                constraintName);
        assertEquals(1, exists, () -> "Expected constraint to exist: " + constraintName);
    }
}
