package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
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
 * SPEC-0069 AC-5: fills stored before executions carried an instrument get their order's.
 *
 * <p>The database is migrated to the tag just before the change, legacy rows are inserted, and only
 * then does Spring start and apply the rest of the changelog, as a real upgrade would.
 */
@SpringBootTest(classes = OmsApplication.class)
class ExecutionInstrumentMigrationIntegrationTest {

    private static final String SYMBOL_ONLY = "ORD-LEGACY-SYM";
    private static final String WITH_ISIN = "ORD-LEGACY-ISIN";
    private static final String GONE = "ORD-LEGACY-GONE";

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
    void legacyFillsGetTheirOrdersInstrument() {
        Map<String, Object> msft = instrumentOf(SYMBOL_ONLY, "S-1");
        assertEquals("MSFT", msft.get("symbol"));
        assertNull(msft.get("security_id"), "the order has no securityId");
        assertNull(msft.get("security_id_source"));

        for (String execId : new String[] {"I-1", "I-2"}) {
            Map<String, Object> intc = instrumentOf(WITH_ISIN, execId);
            assertEquals("INTC", intc.get("symbol"), execId);
            assertEquals("US4581401001", intc.get("security_id"), execId);
            assertEquals("ISIN", intc.get("security_id_source"), execId);
        }

        Map<String, Object> orphan = instrumentOf(GONE, "G-1");
        assertNull(orphan.get("symbol"), "its order is no longer stored: nothing to copy");
    }

    private Map<String, Object> instrumentOf(String orderId, String execId) {
        return jdbcTemplate.queryForMap(
                "select symbol, security_id, security_id_source from executions where order_id = ? and execid = ?",
                orderId, execId);
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
                            .addArgumentValue("tag", "before-019-execution-instrument")
                            .execute());
            try (Connection connection =
                            DriverManager.getConnection(
                                    postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                    Statement statement = connection.createStatement()) {
                statement.execute(
                        "insert into orders (id, order_id, tx_nr, state, symbol, security_id, security_id_source) values "
                                + "(nextval('order_seq'), '" + SYMBOL_ONLY + "', 3, 'FILLED', 'MSFT', null, null), "
                                + "(nextval('order_seq'), '" + WITH_ISIN + "', 4, 'FILLED', 'INTC', 'US4581401001', 'ISIN')");
                statement.execute(
                        "insert into executions (id, order_id, execid, last_qty, last_px, exec_type, status) values "
                                + "(nextval('execution_seq'), '" + SYMBOL_ONLY + "', 'S-1', 100, 420.00, 'F', 'APPLIED'), "
                                + "(nextval('execution_seq'), '" + WITH_ISIN + "', 'I-1', 40, 30.00, 'F', 'APPLIED'), "
                                + "(nextval('execution_seq'), '" + WITH_ISIN + "', 'I-2', 60, 30.10, 'F', 'APPLIED'), "
                                + "(nextval('execution_seq'), '" + GONE + "', 'G-1', 10, 5.00, 'F', 'APPLIED')");
            }
        } catch (Exception e) {
            throw new IllegalStateException("Could not prepare the legacy database", e);
        }
    }
}
