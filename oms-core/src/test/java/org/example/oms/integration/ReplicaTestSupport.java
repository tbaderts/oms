package org.example.oms.integration;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * The archive replica for integration tests (SPEC-0052): a second Postgres on the shared test
 * network, started on first use. Each test class that needs it takes a database of its own on the
 * replica, as it does on the primary ({@link AbstractKafkaPostgresIntegrationTest#isolate}), so its
 * subscription sees only its own world.
 */
final class ReplicaTestSupport {

    static final PostgreSQLContainer<?> replica =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("replica")
                    .withUsername("oms")
                    .withPassword("oms")
                    .withNetwork(AbstractKafkaPostgresIntegrationTest.NETWORK)
                    .withNetworkAliases("oms-replica")
                    // Each archive test class subscribes its own world: one apply worker each, plus
                    // table-sync workers while a new subscription copies its tables. The defaults
                    // (4 workers) let a later class's initial sync queue behind earlier ones.
                    .withCommand("postgres",
                            "-c", "max_worker_processes=32",
                            "-c", "max_logical_replication_workers=16",
                            "-c", "max_sync_workers_per_subscription=4");

    private ReplicaTestSupport() {}

    static synchronized void start() {
        if (!replica.isRunning()) {
            replica.start();
        }
    }

    /** A database of its own on the replica, created once and empty; oms-core migrates it. */
    static synchronized String databaseUrl(String name) {
        start();
        String database = "replica_" + name;
        try (java.sql.Connection connection = java.sql.DriverManager.getConnection(
                        replica.getJdbcUrl(), replica.getUsername(), replica.getPassword());
                java.sql.Statement statement = connection.createStatement()) {
            try (java.sql.ResultSet exists = statement.executeQuery(
                    "select 1 from pg_database where datname = '" + database + "'")) {
                if (!exists.next()) {
                    statement.execute("create database " + database);
                }
            }
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException("Could not create replica database " + database, e);
        }
        return replica.getJdbcUrl().replace("/replica?", "/" + database + "?").replaceAll("/replica$", "/" + database);
    }

    /**
     * Drops the subscription of world {@code name} (and with it its replication slot on the primary),
     * so finished test classes do not keep replication workers and slots busy for later ones.
     */
    static synchronized void dropSubscription(String name) {
        if (!replica.isRunning()) {
            return;
        }
        try (java.sql.Connection connection = java.sql.DriverManager.getConnection(
                        databaseUrl(name), replica.getUsername(), replica.getPassword());
                java.sql.Statement statement = connection.createStatement()) {
            statement.execute("drop subscription if exists oms_history_" + name);
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException("Could not drop the subscription of " + name, e);
        }
    }

    /**
     * Points a test context's replica at {@code replica_<name>}, subscribed to the primary database
     * {@code oms_<name>} (the class's isolated world) through the shared network.
     */
    static void register(DynamicPropertyRegistry registry, String name) {
        String url = databaseUrl(name);
        PostgreSQLContainer<?> primary = AbstractKafkaPostgresIntegrationTest.postgres;
        registry.add("oms.replica.enabled", () -> "true");
        registry.add("oms.replica.url", () -> url);
        registry.add("oms.replica.username", replica::getUsername);
        registry.add("oms.replica.password", replica::getPassword);
        registry.add("oms.replica.subscription", () -> "oms_history_" + name);
        registry.add(
                "oms.replica.primary-conninfo",
                () -> "host=" + AbstractKafkaPostgresIntegrationTest.PRIMARY_ALIAS + " port=5432 dbname=oms_" + name
                        + " user=" + primary.getUsername() + " password=" + primary.getPassword());
    }
}
