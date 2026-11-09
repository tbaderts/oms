package org.example.oms.integration;

import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.example.oms.OmsApplication;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Base for integration tests that need Postgres and Kafka.
 *
 * <p>The containers are singletons, started once per JVM and stopped by Testcontainers' reaper,
 * rather than {@code @Container} fields. Spring caches the application context across test classes;
 * with per-class containers, the second subclass got a cached context still pointing at the
 * first class's stopped containers, and every database call failed.
 */
@SpringBootTest(classes = OmsApplication.class)
public abstract class AbstractKafkaPostgresIntegrationTest {

    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("oms")
                    .withUsername("oms")
                    .withPassword("oms")
                    // Every cached test context keeps its own connection pool open, and contexts in
                    // worlds of their own (isolate) add more; the default 100 is not enough for the
                    // whole suite.
                    .withCommand("postgres", "-c", "max_connections=300");

    static final KafkaContainer kafka =
            new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.9.3"));

    /**
     * The outbound topics, created with several partitions before anything can auto-create them with
     * one. On a single partition every record trivially shares it, and a keying or ordering test
     * would prove nothing.
     */
    static final List<String> OUTBOUND_TOPICS = List.of("orders", "oms_executions", "oms_order_executions");

    static final int OUTBOUND_PARTITIONS = 3;

    static {
        postgres.start();
        kafka.start();
        createOutboundTopics();
    }

    /**
     * A database of its own in the shared Postgres container, for test classes that must be the only
     * instances in their world (SPEC-0048). Advisory locks are per database, so leadership, the outbox
     * and the event log there belong to that class's contexts alone, whatever other cached test
     * contexts run against the default database. Created once, empty; Liquibase migrates it.
     */
    static synchronized String isolatedDatabaseUrl(String name) {
        String database = "oms_" + name;
        try (java.sql.Connection connection = java.sql.DriverManager.getConnection(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                java.sql.Statement statement = connection.createStatement()) {
            try (java.sql.ResultSet exists = statement.executeQuery(
                    "select 1 from pg_database where datname = '" + database + "'")) {
                if (!exists.next()) {
                    statement.execute("create database " + database);
                }
            }
        } catch (java.sql.SQLException e) {
            throw new IllegalStateException("Could not create database " + database, e);
        }
        return postgres.getJdbcUrl().replace("/oms?", "/" + database + "?").replaceAll("/oms$", "/" + database);
    }

    private static void createOutboundTopics() {
        try (Admin admin = Admin.create(Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers()))) {
            admin.createTopics(OUTBOUND_TOPICS.stream()
                            .map(name -> new NewTopic(name, OUTBOUND_PARTITIONS, (short) 1))
                            .toList())
                    .all()
                    .get(30, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new IllegalStateException("Could not create the outbound test topics", e);
        }
    }

    /**
     * The world an isolated class asked for, read once by {@link #registerCommonProperties}. Spring
     * runs a test class's {@code @DynamicPropertySource} methods subclass first, then this class's,
     * on one thread, and the last registration of a name wins, so a subclass cannot override this
     * class's values by registering them itself. It asks here instead, from its own
     * {@code @DynamicPropertySource} method, through {@link #isolate}.
     */
    private static final ThreadLocal<String[]> ISOLATED = new ThreadLocal<>();

    /** Run this class's context in database {@code oms_<name>} and on its own command topic (SPEC-0048). */
    static void isolate(String name, String commandTopic) {
        ISOLATED.set(new String[] {name, commandTopic});
    }

    @DynamicPropertySource
    static void registerCommonProperties(DynamicPropertyRegistry registry) {
        String[] isolated = ISOLATED.get();
        ISOLATED.remove();
        if (isolated == null) {
            registerProperties(registry, postgres::getJdbcUrl, "commands");
        } else {
            String url = isolatedDatabaseUrl(isolated[0]);
            registerProperties(registry, () -> url, isolated[1]);
        }
    }

    /** Every property the integration contexts share, with the database and command topic as given. */
    static void registerProperties(
            DynamicPropertyRegistry registry, java.util.function.Supplier<Object> datasourceUrl, String commandTopic) {
        registry.add("spring.datasource.url", datasourceUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);

        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);

        registry.add("spring.kafka.consumer.properties.schema.registry.url", () -> "mock://oms-it");
        registry.add("spring.kafka.producer.properties.schema.registry.url", () -> "mock://oms-it");
        // The mock registry starts empty; tests register as they go, as the compose dev setup does.
        registry.add("KAFKA_AUTO_REGISTER_SCHEMAS", () -> "true");
        registry.add("kafka.enabled", () -> "true");
        // Concurrency retries are unbounded (SPEC-0048); capped low here so a test outlasting the
        // retry budget stays fast.
        registry.add("kafka.consumer.concurrency-max-interval-ms", () -> "500");
        registry.add("kafka.command-topic", () -> commandTopic);
        registry.add("kafka.order-topic", () -> "orders");
        registry.add("kafka.execution-topic", () -> "oms_executions");
        registry.add("kafka.order-execution-topic", () -> "oms_order_executions");
        // The event-log reconciler (SPEC-0049) is run by the tests that need it, not on a schedule.
        registry.add("oms.reconciliation.enabled", () -> "false");
    }
}
