package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
 * SPEC-0052 AC-1: changelog 017 turns {@code order_events} into a table partitioned by month on
 * {@code time_stamp}, keeping every existing event unchanged in its month's partition.
 *
 * <p>The database is migrated to the tag just before 017, events are written in three past months
 * plus one legacy row without a time stamp, and only then does Spring apply the rest, as a real
 * upgrade would.
 */
@SpringBootTest(classes = OmsApplication.class)
class PartitionMigrationIntegrationTest {

    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("oms")
                    .withUsername("oms")
                    .withPassword("oms");

    /** Each seeded event as {@code id|order_id|version|event|command_id|time_stamp}, before the migration. */
    static List<String> before;

    static {
        postgres.start();
        migrateToTagAndSeed();
    }

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("kafka.enabled", () -> "false");
    }

    @Autowired private JdbcTemplate jdbc;

    private static final String ROWS =
            "select id || '|' || order_id || '|' || version || '|' || event || '|' || coalesce(command_id, '-') || '|' "
                    + "|| coalesce(to_char(time_stamp at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS'), 'null') "
                    + "from order_events order by id";

    @Test
    void migratesExistingEventsIntoMonthlyPartitionsUnchanged() {
        // partitioned by range on time_stamp
        assertEquals("p", jdbc.queryForObject("select relkind::text from pg_class where relname = 'order_events'", String.class));
        assertEquals("RANGE (time_stamp)", jdbc.queryForObject("select pg_get_partkeydef('order_events'::regclass)", String.class));

        // every event is still there, identical; the legacy row without a time stamp got the epoch marker
        List<String> after = jdbc.queryForList(ROWS, String.class);
        assertEquals(before.size(), after.size());
        for (int i = 0; i < before.size(); i++) {
            String expected = before.get(i).endsWith("|null") ? before.get(i).replace("|null", "|1970-01-01T00:00:00") : before.get(i);
            assertEquals(expected, after.get(i));
        }

        // each in its month's partition, the legacy row in the default partition
        Map<String, String> partitionOf = Map.of(
                "E-AUG", "order_events_p202608",
                "E-SEP", "order_events_p202609",
                "E-OCT", "order_events_p202610",
                "E-LEGACY", "order_events_default");
        partitionOf.forEach((orderId, partition) -> assertEquals(
                partition,
                jdbc.queryForObject("select tableoid::regclass::text from order_events where order_id = ?", String.class, orderId),
                orderId));

        // the keys are backfilled, and the history publication exists
        assertEquals(before.size(), jdbc.queryForObject("select count(*) from order_event_keys", Integer.class));
        assertTrue(jdbc.queryForObject("select count(*) from pg_publication where pubname = 'oms_history'", Integer.class) == 1);
    }

    private static void migrateToTagAndSeed() {
        try {
            Scope.child(
                    Map.of(Scope.Attr.resourceAccessor.name(), new ClassLoaderResourceAccessor()),
                    () -> new CommandScope("updateToTag")
                            .addArgumentValue("changelogFile", "db/changelog/db.changelog-master.yaml")
                            .addArgumentValue("url", postgres.getJdbcUrl())
                            .addArgumentValue("username", postgres.getUsername())
                            .addArgumentValue("password", postgres.getPassword())
                            .addArgumentValue("tag", "before-017-partition-order-events")
                            .execute());

            try (Connection connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                    Statement statement = connection.createStatement()) {
                statement.execute(
                        "insert into order_events (id, order_id, version, event, command_id, resulting_state, time_stamp) values "
                                + "(nextval('order_event_seq'), 'E-AUG', 1, 'NEW_ORDER', 'C-AUG', 'UNACK', '2026-08-14T10:00:00Z'), "
                                + "(nextval('order_event_seq'), 'E-SEP', 1, 'NEW_ORDER', 'C-SEP', 'UNACK', '2026-09-01T00:00:00Z'), "
                                + "(nextval('order_event_seq'), 'E-OCT', 1, 'NEW_ORDER', null, 'UNACK', '2026-10-31T23:59:59Z'), "
                                + "(nextval('order_event_seq'), 'E-LEGACY', 1, 'NEW_ORDER', null, 'UNACK', null)");
            }
            try (Connection connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
                before = new JdbcTemplate(new org.springframework.jdbc.datasource.SingleConnectionDataSource(connection, true))
                        .queryForList(ROWS, String.class);
            }
        } catch (Exception e) {
            throw new IllegalStateException("Could not prepare the pre-017 database", e);
        }
    }
}
