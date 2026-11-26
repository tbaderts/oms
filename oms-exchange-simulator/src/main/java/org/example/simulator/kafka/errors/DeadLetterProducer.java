package org.example.simulator.kafka.errors;

import java.util.Map;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;

/**
 * The producer dead letters are written with: string keys, raw value bytes (SPEC-0077).
 *
 * <p>A holder rather than a {@code KafkaTemplate} bean: a second template bean would switch off
 * Boot's auto-configured one, which the command gateway uses. Closed when the context closes.
 */
public class DeadLetterProducer implements AutoCloseable {

    private final DefaultKafkaProducerFactory<String, byte[]> factory;
    private final KafkaTemplate<String, byte[]> template;

    public DeadLetterProducer(Map<String, Object> producerProperties, ErrorPolicyProperties errorPolicy) {
        Map<String, Object> config = new java.util.HashMap<>(producerProperties);
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        config.putAll(errorPolicy.producerTimeouts());
        this.factory = new DefaultKafkaProducerFactory<>(config);
        this.template = new KafkaTemplate<>(factory);
        this.template.setObservationEnabled(true);
    }

    public KafkaTemplate<String, byte[]> template() {
        return template;
    }

    @Override
    public void close() {
        factory.destroy();
    }
}
