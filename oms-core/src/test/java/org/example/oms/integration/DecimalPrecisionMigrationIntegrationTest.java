package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import liquibase.Scope;
import liquibase.command.CommandScope;
import liquibase.resource.ClassLoaderResourceAccessor;

/**
 * SPEC-0039 AC-2, AC-3: the precision migration converts price and quantity columns to
 * NUMERIC(18,8) without changing any stored value, and refuses, naming the column, rather than
 * round a value that does not fit.
 *
 * <p>Each test gets its own database: migrated to the tag just before the change, seeded, then
 * migrated the rest of the way, as a real upgrade would be. No Spring context is needed.
 */
@Testcontainers
class DecimalPrecisionMigrationIntegrationTest {

    private static final String TAG = "before-008-decimal-precision";
    private static final String CHANGELOG = "db/changelog/db.changelog-master.yaml";

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void existingValuesSurviveUnchanged() throws Exception {
        String url = freshDatabase();
        liquibase("updateToTag", url, TAG);
        execute(url, "insert into orders (id, order_id, tx_nr, price, order_qty, cum_qty, leaves_qty) "
                + "values (nextval('order_seq'), 'ORD-P1', 0, 170.12345678, 100.5, 0.12345678, 100.37654322)");
        execute(url, "insert into executions (id, order_id, execid, last_px, last_qty) "
                + "values (nextval('execution_seq'), 'ORD-P1', 'EX-P1', 9999999999.99999999, 0.00000001)");

        liquibase("update", url, null);

        assertEquals(new BigDecimal("170.12345678"), decimal(url, "select price from orders where order_id = 'ORD-P1'"));
        assertEquals(new BigDecimal("100.50000000"), decimal(url, "select order_qty from orders where order_id = 'ORD-P1'"));
        assertEquals(new BigDecimal("100.37654322"), decimal(url, "select leaves_qty from orders where order_id = 'ORD-P1'"));
        assertEquals(new BigDecimal("9999999999.99999999"), decimal(url, "select last_px from executions where execid = 'EX-P1'"));
        assertEquals(new BigDecimal("0.00000001"), decimal(url, "select last_qty from executions where execid = 'EX-P1'"));
        assertEquals("numeric(18,8)", columnType(url, "orders", "price"));
    }

    @Test
    void valueBeyondPrecision_failsTheMigrationNamingTheColumn() throws Exception {
        String url = freshDatabase();
        liquibase("updateToTag", url, TAG);
        execute(url, "insert into orders (id, order_id, tx_nr, price) "
                + "values (nextval('order_seq'), 'ORD-P2', 0, 170.123456789)");

        Exception failure = assertThrows(Exception.class, () -> liquibase("update", url, null));

        assertTrue(messages(failure).contains("orders.price"), messages(failure));
        assertEquals("numeric", columnType(url, "orders", "price"), "no column type changed");
        assertEquals(new BigDecimal("170.123456789"), decimal(url, "select price from orders where order_id = 'ORD-P2'"));
    }

    @Test
    void integerDigitsBeyondPrecision_failsTheMigrationNamingTheColumn() throws Exception {
        String url = freshDatabase();
        liquibase("updateToTag", url, TAG);
        execute(url, "insert into executions (id, order_id, execid, last_qty) "
                + "values (nextval('execution_seq'), 'ORD-P3', 'EX-P3', 12345678901)");

        Exception failure = assertThrows(Exception.class, () -> liquibase("update", url, null));

        assertTrue(messages(failure).contains("executions.last_qty"), messages(failure));
        assertEquals("numeric", columnType(url, "executions", "last_qty"), "no column type changed");
    }

    private static String freshDatabase() throws Exception {
        String name = "mig_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        execute(postgres.getJdbcUrl(), "create database " + name);
        return postgres.getJdbcUrl().replaceFirst("/[^/?]+(\\?|$)", "/" + name + "$1");
    }

    private static void liquibase(String command, String url, String tag) throws Exception {
        Scope.child(Map.of(Scope.Attr.resourceAccessor.name(), new ClassLoaderResourceAccessor()), () -> {
            CommandScope scope = new CommandScope(command)
                    .addArgumentValue("changelogFile", CHANGELOG)
                    .addArgumentValue("url", url)
                    .addArgumentValue("username", postgres.getUsername())
                    .addArgumentValue("password", postgres.getPassword());
            if (tag != null) {
                scope.addArgumentValue("tag", tag);
            }
            scope.execute();
        });
    }

    private static void execute(String url, String sql) throws Exception {
        try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
                Statement s = c.createStatement()) {
            s.execute(sql);
        }
    }

    private static BigDecimal decimal(String url, String sql) throws Exception {
        try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
                Statement s = c.createStatement();
                ResultSet rs = s.executeQuery(sql)) {
            rs.next();
            return rs.getBigDecimal(1);
        }
    }

    private static String columnType(String url, String table, String column) throws Exception {
        try (Connection c = DriverManager.getConnection(url, postgres.getUsername(), postgres.getPassword());
                Statement s = c.createStatement();
                ResultSet rs = s.executeQuery("select format_type(atttypid, atttypmod) from pg_attribute "
                        + "where attrelid = '" + table + "'::regclass and attname = '" + column + "'")) {
            rs.next();
            return rs.getString(1);
        }
    }

    /** The failure and all its causes: Liquibase wraps the database's message several levels deep. */
    private static String messages(Throwable failure) {
        StringBuilder all = new StringBuilder();
        for (Throwable t = failure; t != null; t = t.getCause()) {
            all.append(t.getMessage()).append(" | ");
        }
        return all.toString();
    }
}
