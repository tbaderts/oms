package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
