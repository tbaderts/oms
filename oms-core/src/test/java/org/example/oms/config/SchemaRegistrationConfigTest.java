package org.example.oms.config;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.yaml.snakeyaml.Yaml;

/**
 * SPEC-0025 AC-6: schemas are registered by {@code registerSchemas}, not by the services. oms-core
 * runs with {@code auto.register.schemas=false} unless {@code KAFKA_AUTO_REGISTER_SCHEMAS} turns it
 * on, which only the docker-compose dev setup does, for the two services that produce.
 */
class SchemaRegistrationConfigTest {

    private static final String AUTO_REGISTER = "spring.kafka.properties.auto.register.schemas";

    @Test
    void autoRegisterIsOffUnlessTheVariableTurnsItOn() throws IOException {
        assertEquals("false", environment(Map.of()).getProperty(AUTO_REGISTER));
        assertEquals("true", environment(Map.of("KAFKA_AUTO_REGISTER_SCHEMAS", "true")).getProperty(AUTO_REGISTER));
    }

    @Test
    @SuppressWarnings("unchecked")
    void composeTurnsItOnForTheProducersOnly() throws IOException {
        Map<String, Object> compose;
        try (Reader reader = Files.newBufferedReader(Path.of("../docker-compose.yml"))) {
            compose = new Yaml().load(reader);
        }
        Map<String, Object> services = (Map<String, Object>) compose.get("services");

        Map<String, Object> enabled = new TreeMap<>();
        services.forEach((name, service) -> {
            Object environment = ((Map<String, Object>) service).get("environment");
            if (environment instanceof Map<?, ?> variables && variables.containsKey("KAFKA_AUTO_REGISTER_SCHEMAS")) {
                enabled.put(name, String.valueOf(variables.get("KAFKA_AUTO_REGISTER_SCHEMAS")));
            }
        });
        assertEquals(Map.of("oms-core", "true", "exchange-simulator", "true"), enabled);
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
