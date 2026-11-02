package org.example.simulator;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.yaml.snakeyaml.Yaml;

/**
 * SPEC-0025 AC-6: the simulator writes commands under one subject per record and does not register
 * schemas itself, unless {@code KAFKA_AUTO_REGISTER_SCHEMAS} turns it on, as the docker-compose dev
 * setup does.
 */
class SchemaRegistrationConfigTest {

    private static final String PRODUCER = "spring.kafka.producer.properties.";

    @Test
    void autoRegisterIsOffUnlessTheVariableTurnsItOn() throws IOException {
        assertEquals("false", environment(Map.of()).getProperty(PRODUCER + "auto.register.schemas"));
        assertEquals("true", environment(Map.of("KAFKA_AUTO_REGISTER_SCHEMAS", "true"))
                .getProperty(PRODUCER + "auto.register.schemas"));
        assertEquals("io.confluent.kafka.serializers.subject.TopicRecordNameStrategy",
                environment(Map.of()).getProperty(PRODUCER + "value.subject.name.strategy"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void composeTurnsItOnForTheSimulator() throws IOException {
        Map<String, Object> compose;
        try (Reader reader = Files.newBufferedReader(Path.of("../docker-compose.yml"))) {
            compose = new Yaml().load(reader);
        }
        Map<String, Object> simulator = (Map<String, Object>) ((Map<String, Object>) compose.get("services")).get("exchange-simulator");
        Map<String, Object> environment = (Map<String, Object>) simulator.get("environment");

        assertEquals("true", String.valueOf(environment.get("KAFKA_AUTO_REGISTER_SCHEMAS")));
    }

    private static StandardEnvironment environment(Map<String, Object> variables) throws IOException {
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().addFirst(new MapPropertySource("variables", variables));
        new YamlPropertySourceLoader()
                .load("application", new ClassPathResource("application.yml"))
                .forEach(source -> environment.getPropertySources().addLast(source));
        return environment;
    }
}
