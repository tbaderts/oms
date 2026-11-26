package org.example.streaming.kafka.errors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.InputStream;
import java.time.Duration;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.util.backoff.BackOffExecution;
import org.yaml.snakeyaml.Yaml;

/** SPEC-0077 AC-10: the error policy binds from kafka.error-policy.* with the shared defaults. */
class ErrorPolicyPropertiesTest {

    private static ErrorPolicyProperties bind(Map<String, String> values) {
        return new Binder(new MapConfigurationPropertySource(values))
                .bindOrCreate("kafka.error-policy", ErrorPolicyProperties.class);
    }

    @Test
    void defaultsAndBinding() {
        ErrorPolicyProperties defaults = bind(Map.of("kafka.error-policy.service-name", "svc"));
        assertThat(defaults.retryFor()).isEqualTo(Duration.ofMinutes(2));
        assertThat(defaults.initialInterval()).isEqualTo(Duration.ofMillis(500));
        assertThat(defaults.maxInterval()).isEqualTo(Duration.ofSeconds(30));
        assertThat(defaults.multiplier()).isEqualTo(2.0);

        ErrorPolicyProperties set = bind(Map.of(
                "kafka.error-policy.service-name", "svc",
                "kafka.error-policy.retry-for", "PT10S",
                "kafka.error-policy.initial-interval", "PT0.1S",
                "kafka.error-policy.max-interval", "PT1S",
                "kafka.error-policy.multiplier", "3"));
        assertThat(set).isEqualTo(new ErrorPolicyProperties("svc", Duration.ofSeconds(10), Duration.ofMillis(100), Duration.ofSeconds(1), 3.0));
    }

    @Test
    void theServiceYamlNamesItselfAndUsesTheSharedDefaults() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/application.yml")) {
            Map<String, Object> yaml = new Yaml().load(in);
            @SuppressWarnings("unchecked")
            Map<String, Object> policy = (Map<String, Object>) ((Map<String, Object>) yaml.get("kafka")).get("error-policy");
            assertThat(policy).containsEntry("service-name", "oms-streaming-service")
                    .containsEntry("retry-for", "${KAFKA_RETRY_FOR:PT2M}")
                    .containsEntry("initial-interval", "${KAFKA_RETRY_INITIAL:PT0.5S}")
                    .containsEntry("max-interval", "${KAFKA_RETRY_MAX:PT30S}")
                    .containsEntry("multiplier", 2.0);
        }
    }

    @Test
    void rejectsSettingsThatWouldBreakAConsumer() {
        assertThatThrownBy(() -> new ErrorPolicyProperties(" ", Duration.ofMinutes(2), Duration.ofMillis(500), Duration.ofSeconds(30), 2))
                .hasMessageContaining("service-name");
        assertThatThrownBy(() -> new ErrorPolicyProperties("svc", Duration.ofMinutes(10), Duration.ofMillis(500), Duration.ofMinutes(5), 2))
                .hasMessageContaining("max.poll.interval.ms");
        assertThatThrownBy(() -> new ErrorPolicyProperties("svc", Duration.ofMinutes(2), Duration.ofSeconds(5), Duration.ofSeconds(1), 2))
                .hasMessageContaining("max-interval");
        assertThatThrownBy(() -> new ErrorPolicyProperties("svc", Duration.ofSeconds(10), Duration.ofMillis(500), Duration.ofSeconds(30), 2))
                .hasMessageContaining("<= retry-for");
    }

    @Test
    void windowBackOffStopsOnceTheWaitsReachRetryFor() {
        ErrorPolicyProperties p = new ErrorPolicyProperties("svc", Duration.ofSeconds(3), Duration.ofMillis(500), Duration.ofSeconds(1), 2);
        BackOffExecution execution = p.windowBackOff().start();
        long total = 0;
        int retries = 0;
        for (long wait = execution.nextBackOff(); wait != BackOffExecution.STOP; wait = execution.nextBackOff()) {
            total += wait;
            retries++;
            assertThat(wait).isLessThanOrEqualTo(1000);
        }
        assertThat(retries).isGreaterThan(2);
        assertThat(total).isBetween(3000L, 4000L);
        assertThat(p.backOffBefore(1)).isEqualTo(Duration.ofMillis(500));
        assertThat(p.backOffBefore(2)).isEqualTo(Duration.ofSeconds(1));
        assertThat(p.backOffBefore(9)).isEqualTo(Duration.ofSeconds(1));
    }
}
