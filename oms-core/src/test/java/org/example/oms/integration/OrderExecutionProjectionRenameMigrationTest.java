package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

import liquibase.Scope;
import liquibase.command.CommandScope;
import liquibase.resource.ClassLoaderResourceAccessor;

/**
 * SPEC-0045 AC-1 and AC-2: the order-execution projection table and every object named after it are
 * renamed with their rows kept, and a rollback restores the original names.
 *
 * <p>Runs Liquibase directly, without the application: each test gets a fresh database, migrated to
 * the tag just before the rename, seeded with legacy rows, then migrated (and rolled back).
 */
class OrderExecutionProjectionRenameMigrationTest {

    private static final String CHANGELOG = "db/changelog/db.changelog-master.yaml";
    private static final String TAG = "before-012-order-execution-projection";

    private static final List<String> OLD_NAMES = List.of(
            "order_execution_view", "order_execution_view_seq", "pk_order_execution_view",
            "uq_order_execution_view_order_id_execid", "idx_oev_root_order_id", "idx_oev_account",
            "idx_oev_transact_time");
    private static final List<String> NEW_NAMES = List.of(
            "order_execution_projection", "order_execution_projection_seq", "pk_order_execution_projection",
            "uq_order_execution_projection_order_id_execid", "idx_order_execution_projection_root_order_id",
            "idx_order_execution_projection_account", "idx_order_execution_projection_transact_time");

    private PostgreSQLContainer<?> postgres;

    @BeforeEach
    void migrateToTagAndSeed() throws Exception {
        postgres = new PostgreSQLContainer<>("postgres:16-alpine")
                .withDatabaseName("oms")
                .withUsername("oms")
                .withPassword("oms");
        postgres.start();
        liquibase("updateToTag", Map.of("tag", TAG));
        // Every column populated, so "the same rows" covers the whole row, not only its keys.
        execute("insert into order_execution_view (id, order_id, execid, root_order_id, parent_order_id, leg,"
                + " cl_ord_id, session_id, account, side, symbol, security_id, ord_type, price, order_qty,"
                + " settl_currency, ex_destination, last_qty, last_px, exec_type, last_capacity, last_mkt,"
                + " transact_time, cum_qty, leaves_qty, avg_px, state, order_version, trade_date, projected_at) values "
                + "(nextval('order_execution_view_seq'), 'ORD-R1', 'EX-1', 'ROOT-R', 'ROOT-R', 'CHILD', 'CL-1', 'SES-1',"
                + " 'ACC-1', 'BUY', 'AAPL', 'US0378331005', 'LIMIT', 172.00, 100, 'USD', 'XNAS', 40, 171.95, 'F', 'A',"
                + " 'XNAS', '2026-11-07T09:30:01Z', 40, 60, 171.95, 'LIVE', 3, '2026-11-07', '2026-11-07T09:30:02Z'), "
                + "(nextval('order_execution_view_seq'), 'ORD-R1', 'EX-2', 'ROOT-R', 'ROOT-R', 'CHILD', 'CL-1', 'SES-1',"
                + " 'ACC-1', 'BUY', 'AAPL', 'US0378331005', 'LIMIT', 172.00, 100, 'USD', 'XNAS', 60, 172.00, 'F', 'A',"
                + " 'XNAS', '2026-11-07T09:30:03Z', 100, 0, 171.98, 'FILLED', 4, '2026-11-07', '2026-11-07T09:30:04Z')");
    }

    @AfterEach
    void stop() {
        postgres.stop();
    }

    @Test
    void renameKeepsRowsAndRenamesEveryObject() throws Exception {
        List<String> before = rows("order_execution_view");
        long maxId = queryLong("select max(id) from order_execution_view");

        liquibase("update", Map.of());

        assertEquals(before, rows("order_execution_projection"), "same rows under the new name");
        for (String name : NEW_NAMES) {
            assertTrue(exists(name), name + " exists");
        }
        assertEquals(List.of(), leftovers(), "nothing is still named after the view");
        assertTrue(
                queryLong("select nextval('order_execution_projection_seq')") > maxId,
                "the next id follows the existing rows");
    }

    @Test
    void rollbackRestoresTheOriginalNames() throws Exception {
        List<String> before = rows("order_execution_view");
        liquibase("update", Map.of());

        liquibase("rollback", Map.of("tag", TAG));

        assertEquals(before, rows("order_execution_view"), "same rows under the old name");
        for (String name : OLD_NAMES) {
            assertTrue(exists(name), name + " exists again");
        }
        for (String name : NEW_NAMES) {
            assertFalse(exists(name), name + " is gone");
        }
    }

    private void liquibase(String command, Map<String, String> arguments) throws Exception {
        Scope.child(
                Map.of(Scope.Attr.resourceAccessor.name(), new ClassLoaderResourceAccessor()),
                () -> {
                    CommandScope scope = new CommandScope(command)
                            .addArgumentValue("changelogFile", CHANGELOG)
                            .addArgumentValue("url", postgres.getJdbcUrl())
                            .addArgumentValue("username", postgres.getUsername())
                            .addArgumentValue("password", postgres.getPassword());
                    arguments.forEach(scope::addArgumentValue);
                    scope.execute();
                });
    }

    /** Relations (tables, sequences, indexes) and constraints with the given name. */
    private boolean exists(String name) throws SQLException {
        return queryLong("select (select count(*) from pg_class where relname = '" + name + "')"
                + " + (select count(*) from pg_constraint where conname = '" + name + "')") > 0;
    }

    private List<String> leftovers() throws SQLException {
        List<String> names = new ArrayList<>();
        try (Connection c = connect();
                Statement s = c.createStatement();
                ResultSet r = s.executeQuery(
                        "select relname from pg_class where relname like '%order_execution_view%' or relname like 'idx_oev_%'"
                                + " union select conname from pg_constraint where conname like '%order_execution_view%'")) {
            while (r.next()) {
                names.add(r.getString(1));
            }
        }
        return names;
    }

    /** Every column of every row, by column name, in id order. */
    private List<String> rows(String table) throws SQLException {
        List<String> rows = new ArrayList<>();
        try (Connection c = connect();
                Statement s = c.createStatement();
                ResultSet r = s.executeQuery("select * from " + table + " order by id")) {
            int columns = r.getMetaData().getColumnCount();
            while (r.next()) {
                StringBuilder row = new StringBuilder();
                for (int i = 1; i <= columns; i++) {
                    row.append(r.getMetaData().getColumnName(i)).append('=').append(r.getString(i)).append('|');
                }
                rows.add(row.toString());
            }
        }
        assertEquals(2, rows.size(), table + " holds the two seeded rows");
        assertTrue(rows.getFirst().contains("avg_px=171.95") && rows.getFirst().contains("security_id=US0378331005"),
                "non-key columns are compared too: " + rows.getFirst());
        return rows;
    }

    private long queryLong(String sql) throws SQLException {
        try (Connection c = connect(); Statement s = c.createStatement(); ResultSet r = s.executeQuery(sql)) {
            r.next();
            return r.getLong(1);
        }
    }

    private void execute(String sql) throws SQLException {
        try (Connection c = connect(); Statement s = c.createStatement()) {
            s.execute(sql);
        }
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
    }
}
