package org.example.oms.integration;

import static org.assertj.core.api.Assertions.assertThat;

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
 * SPEC-0077 (changelog 020): a row stuck under the old attempt budget stays stuck by being parked; a
 * row still being retried stays pending.
 *
 * <p>The database is migrated to the tag just before the change, legacy rows are inserted, and only
 * then does Spring start and apply the rest of the changelog, as a real upgrade would.
 */
@SpringBootTest(classes = OmsApplication.class)
class OutboxDeadLetterMigrationIntegrationTest {

    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("oms")
                    .withUsername("oms")
                    .withPassword("oms");

    static {
        postgres.start();
        migrateToTagAndSeedLegacyRows();
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
    void stuckRowsStayStuck() {
        Map<String, Object> stuck = row("AGG-STUCK");
        assertThat(stuck.get("parked_at")).as("10 attempts: stuck before, parked now").isNotNull();
        assertThat(stuck.get("dead_letter_topic")).as("never dead-lettered").isNull();
        assertThat(stuck.get("attempts")).isEqualTo(10);

        Map<String, Object> retrying = row("AGG-RETRYING");
        assertThat(retrying.get("parked_at")).as("3 attempts: still pending").isNull();
        assertThat(retrying.get("first_failed_at")).isNull();
        assertThat(retrying.get("next_attempt_at")).isNull();
    }

    private Map<String, Object> row(String aggregateId) {
        return jdbcTemplate.queryForMap(
                "select attempts, first_failed_at, next_attempt_at, parked_at, dead_letter_topic from outbox where aggregate_id = ?",
                aggregateId);
    }

    private static void migrateToTagAndSeedLegacyRows() {
        try {
            Scope.child(
                    Map.of(Scope.Attr.resourceAccessor.name(), new ClassLoaderResourceAccessor()),
                    () -> new CommandScope("updateToTag")
                            .addArgumentValue("changelogFile", "db/changelog/db.changelog-master.yaml")
                            .addArgumentValue("url", postgres.getJdbcUrl())
                            .addArgumentValue("username", postgres.getUsername())
                            .addArgumentValue("password", postgres.getPassword())
                            .addArgumentValue("tag", "before-020-outbox-dead-letter")
                            .execute());
            try (Connection connection =
                            DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                    Statement statement = connection.createStatement()) {
                statement.execute(
                        "insert into outbox (id, aggregate_type, aggregate_id, topic, aggregate_version, created_at, attempts, last_error) values "
                                + "(nextval('outbox_seq'), 'ORDER', 'AGG-STUCK', 'orders', 1, now(), 10, 'boom'), "
                                + "(nextval('outbox_seq'), 'ORDER', 'AGG-RETRYING', 'orders', 1, now(), 3, 'boom')");
            }
        } catch (Exception e) {
            throw new IllegalStateException("Could not prepare the legacy database", e);
        }
    }
}
