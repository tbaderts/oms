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
abstract class AbstractKafkaPostgresIntegrationTest {

    static final PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("oms")
                    .withUsername("oms")
                    .withPassword("oms");

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

    @DynamicPropertySource
    static void registerCommonProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);

        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);

        registry.add("spring.kafka.consumer.properties.schema.registry.url", () -> "mock://oms-it");
        registry.add("spring.kafka.producer.properties.schema.registry.url", () -> "mock://oms-it");
        registry.add("kafka.enabled", () -> "true");
        registry.add("kafka.command-topic", () -> "commands");
        registry.add("kafka.order-topic", () -> "orders");
        registry.add("kafka.execution-topic", () -> "oms_executions");
        registry.add("kafka.order-execution-topic", () -> "oms_order_executions");
    }
}
