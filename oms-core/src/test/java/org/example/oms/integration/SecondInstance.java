package org.example.oms.integration;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.example.oms.OmsApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;

/**
 * Another running instance of oms-core for the two-instance tests (SPEC-0048): a full application
 * context on the same Postgres and Kafka as the test's own, as a second process would be.
 *
 * <p>It copies the settings a test context runs with from that context's environment, so it joins
 * the same database, topics and consumer group unless overridden.
 */
final class SecondInstance {

    /** The settings an instance needs to share a test context's world. */
    private static final List<String> SHARED = List.of(
            "spring.datasource.url",
            "spring.datasource.username",
            "spring.datasource.password",
            "spring.jpa.hibernate.ddl-auto",
            "spring.kafka.bootstrap-servers",
            "spring.kafka.consumer.properties.schema.registry.url",
            "spring.kafka.producer.properties.schema.registry.url",
            "spring.kafka.consumer.group-id",
            "KAFKA_AUTO_REGISTER_SCHEMAS",
            "kafka.enabled",
            "kafka.consumer.concurrency-max-interval-ms",
            "kafka.command-topic",
            "kafka.order-topic",
            "kafka.execution-topic",
            "kafka.order-execution-topic");

    private SecondInstance() {}

    /** Starts an instance in the same world as the given environment, with these settings changed. */
    static ConfigurableApplicationContext start(Environment like, Map<String, Object> overrides) {
        Map<String, Object> properties = new HashMap<>();
        for (String name : SHARED) {
            String value = like.getProperty(name);
            if (value != null) {
                properties.put(name, value);
            }
        }
        properties.put("server.port", "0");
        properties.put("oms.end-of-day.enabled", "false");
        properties.putAll(overrides);
        // As command-line arguments: they outrank application.yml. Builder "properties" are defaults and
        // would lose to it (the second instance would take port 8090 and the configured database).
        String[] arguments = properties.entrySet().stream()
                .map(entry -> "--" + entry.getKey() + "=" + entry.getValue())
                .toArray(String[]::new);
        return new SpringApplicationBuilder(OmsApplication.class).run(arguments);
    }

    /** Starts an instance in a world of its own: its own database, command topic and consumer group. */
    static ConfigurableApplicationContext startIsolated(Environment like, String name, Map<String, Object> overrides) {
        Map<String, Object> isolated = new HashMap<>();
        isolated.put("spring.datasource.url", AbstractKafkaPostgresIntegrationTest.isolatedDatabaseUrl(name));
        isolated.put("kafka.command-topic", "commands-" + name);
        isolated.put("spring.kafka.consumer.group-id", "oms-" + name);
        isolated.putAll(overrides);
        return start(like, isolated);
    }
}
