package org.example.simulator;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Shared Kafka for the simulator's integration tests. A singleton container: Spring caches the
 * application context across test classes, so the broker must outlive any one class.
 */
public abstract class AbstractKafkaIntegrationTest {

    protected static final String REGISTRY = "mock://simulator-it";

    protected static final KafkaContainer kafka =
            new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.9.3"));

    static {
        kafka.start();
    }

    @DynamicPropertySource
    static void kafkaProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
        registry.add("spring.kafka.consumer.properties.schema.registry.url", () -> REGISTRY);
        registry.add("spring.kafka.producer.properties.schema.registry.url", () -> REGISTRY);
        // The mock registry starts empty; tests register as they go, as the compose dev setup does.
        registry.add("KAFKA_AUTO_REGISTER_SCHEMAS", () -> "true");
        // Never Alpha Vantage, even when the developer's environment has ALPHAVANTAGE_API_KEY
        // (which outranks properties files, but not these): the static prices are used (SPEC-0073).
        // A subclass registers its own stub and key after these, and so overrides them.
        registry.add("simulator.alpha-vantage.api-key", () -> "");
        registry.add("simulator.alpha-vantage.base-url", () -> "http://127.0.0.1:9");
    }
}
