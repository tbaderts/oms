package org.example.oms.integration;

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

    static {
        postgres.start();
        kafka.start();
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
    }
}
