package org.example.oms.config;

import org.example.oms.kafka.errors.ErrorPolicyProperties;
import org.springframework.boot.kafka.autoconfigure.DefaultKafkaProducerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

/**
 * Producer wiring.
 *
 * <p>Exists to expose a concretely typed {@code KafkaTemplate<String, Object>}: the outbox carries
 * both {@code OrderMessage} and {@code Execution} payloads on different topics, so the value type is
 * genuinely heterogeneous while keys are always the aggregate id.
 *
 * <p>Producer guarantees are declared in {@code application.yml} — see the {@code enable.idempotence}
 * and {@code max.in.flight.requests.per.connection} settings. How long the client retries a send is
 * the error policy's window (SPEC-0077): {@link ErrorPolicyProperties#producerTimeouts()}.
 */
@Configuration
public class KafkaProducerConfig {

    @Bean
    public KafkaTemplate<String, Object> kafkaTemplate(
            ProducerFactory<String, Object> producerFactory) {
        KafkaTemplate<String, Object> template = new KafkaTemplate<>(producerFactory);
        // A producer span per record, with its W3C trace context in the record headers (SPEC-0033).
        template.setObservationEnabled(true);
        return template;
    }

    /** The client retries a retriable send error for the error policy's window (SPEC-0077). */
    @Bean
    public DefaultKafkaProducerFactoryCustomizer errorPolicyProducerTimeouts(ErrorPolicyProperties errorPolicy) {
        return factory -> factory.updateConfigs(errorPolicy.producerTimeouts());
    }
}
