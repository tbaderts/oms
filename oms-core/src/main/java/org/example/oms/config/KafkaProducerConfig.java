package org.example.oms.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

/**
 * Producer wiring.
 *
 * <p>Exists only to expose a concretely typed {@code KafkaTemplate<String, Object>}: the outbox
 * carries both {@code OrderMessage} and {@code Execution} payloads on different topics, so the value
 * type is genuinely heterogeneous while keys are always the aggregate id.
 *
 * <p>Producer guarantees are declared in {@code application.yml} rather than here — see the
 * {@code enable.idempotence} and {@code max.in.flight.requests.per.connection} settings.
 */
@Configuration
public class KafkaProducerConfig {

    @Bean
    public KafkaTemplate<String, Object> kafkaTemplate(
            ProducerFactory<String, Object> producerFactory) {
        return new KafkaTemplate<>(producerFactory);
    }
}
