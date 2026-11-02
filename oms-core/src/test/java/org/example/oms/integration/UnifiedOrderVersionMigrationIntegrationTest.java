package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Map;

import org.example.oms.OmsApplication;
import org.example.oms.model.Event;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.OrderEventAppender;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

import liquibase.Scope;
import liquibase.command.CommandScope;
import liquibase.resource.ClassLoaderResourceAccessor;

/**
 * SPEC-0027 AC-4: orders written before the order version and the event version were unified get
 * the version of their latest event as {@code tx_nr} (0 without events), so the next event follows
 * the log with no gap and no duplicate.
 *
 * <p>The database is migrated to the tag just before the change, legacy rows are inserted, and only
 * then does Spring start and apply the rest of the changelog, as a real upgrade would.
 */
@SpringBootTest(classes = OmsApplication.class)
class UnifiedOrderVersionMigrationIntegrationTest {

    private static final String WITH_EVENTS = "ORD-LEGACY-V";
    private static final String WITHOUT_EVENTS = "ORD-LEGACY-NONE";
    private static final String WITH_GAP = "ORD-LEGACY-GAP";

    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("oms")
                    .withUsername("oms")
                    .withPassword("oms");

    static {
        postgres.start();
        migrateToTagAndSeedLegacyOrders();
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
    @Autowired private OrderRepository orderRepository;
    @Autowired private OrderEventAppender orderEventAppender;
    @Autowired private TransactionTemplate transactionTemplate;

    @Test
    void migrationSetsTxNrToTheLatestEventVersion() {
        assertEquals(3L, txNr(WITH_EVENTS), "the latest of events 1-3, not the old counter 7");
        assertEquals(0L, txNr(WITHOUT_EVENTS), "no events yet");
        assertEquals(5L, txNr(WITH_GAP), "the highest of 1, 2, 5: the next version cannot collide");

        long appended = transactionTemplate.execute(status -> orderEventAppender.appendOrderEvent(
                orderRepository.findByOrderId(WITH_EVENTS).orElseThrow(), Event.ACK, null));

        assertEquals(4L, appended, "the next event follows the log");
        assertEquals(4L, txNr(WITH_EVENTS));
    }

    private long txNr(String orderId) {
        return jdbcTemplate.queryForObject("select tx_nr from orders where order_id = ?", Long.class, orderId);
    }

    private static void migrateToTagAndSeedLegacyOrders() {
        try {
            Scope.child(
                    Map.of(Scope.Attr.resourceAccessor.name(), new ClassLoaderResourceAccessor()),
                    () -> new CommandScope("updateToTag")
                            .addArgumentValue("changelogFile", "db/changelog/db.changelog-master.yaml")
                            .addArgumentValue("url", postgres.getJdbcUrl())
                            .addArgumentValue("username", postgres.getUsername())
                            .addArgumentValue("password", postgres.getPassword())
                            .addArgumentValue("tag", "before-010-unified-order-version")
                            .execute());

            try (Connection connection =
                            DriverManager.getConnection(
                                    postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                    Statement statement = connection.createStatement()) {
                // Hibernate's counter drifted from the log: 7 against three events.
                statement.execute(
                        "insert into orders (id, order_id, tx_nr, state) values "
                                + "(nextval('order_seq'), '" + WITH_EVENTS + "', 7, 'LIVE'), "
                                + "(nextval('order_seq'), '" + WITHOUT_EVENTS + "', 5, 'UNACK'), "
                                + "(nextval('order_seq'), '" + WITH_GAP + "', 2, 'LIVE')");
                statement.execute(
                        "insert into order_events (id, order_id, version, event, transaction, resulting_state, time_stamp) values "
                                + "(nextval('order_event_seq'), '" + WITH_EVENTS + "', 1, 'NEW_ORDER', null, 'UNACK', now()), "
                                + "(nextval('order_event_seq'), '" + WITH_EVENTS + "', 2, 'ACK', null, 'LIVE', now()), "
                                + "(nextval('order_event_seq'), '" + WITH_EVENTS + "', 3, 'ACK', null, 'LIVE', now()), "
                                + "(nextval('order_event_seq'), '" + WITH_GAP + "', 1, 'NEW_ORDER', null, 'UNACK', now()), "
                                + "(nextval('order_event_seq'), '" + WITH_GAP + "', 2, 'ACK', null, 'LIVE', now()), "
                                + "(nextval('order_event_seq'), '" + WITH_GAP + "', 5, 'ACK', null, 'LIVE', now())");
            }
        } catch (Exception e) {
            throw new IllegalStateException("Could not prepare the legacy database", e);
        }
    }
}
