package org.example.oms.config;

import org.apache.avro.specific.SpecificRecord;
import org.apache.kafka.common.errors.SerializationException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.kafka.autoconfigure.KafkaProperties;
import org.springframework.stereotype.Component;

import io.confluent.kafka.serializers.KafkaAvroDeserializer;
import jakarta.annotation.PreDestroy;

/**
 * Decodes the bytes of a command record (SPEC-0025).
 *
 * <p>The commands topic is consumed as raw bytes and decoded here rather than by the container, so a
 * record that cannot be handled — undecodable, or a type without a handler — still has its original
 * bytes when it is dead-lettered. The deserializer is configured from the consumer properties
 * ({@code schema.registry.url}, {@code specific.avro.reader}).
 */
@Component
@ConditionalOnProperty(prefix = "kafka", name = "enabled", havingValue = "true", matchIfMissing = false)
public class CommandDecoder {

    private final KafkaAvroDeserializer deserializer = new KafkaAvroDeserializer();

    public CommandDecoder(KafkaProperties kafkaProperties) {
        deserializer.configure(kafkaProperties.buildConsumerProperties(), false);
    }

    /**
     * @throws UndecodableCommandException if the bytes are not an Avro command record this service
     *     has a class for
     */
    public SpecificRecord decode(String topic, byte[] value) {
        if (value == null || value.length == 0) {
            throw new UndecodableCommandException("Empty command record on " + topic, null);
        }
        Object decoded;
        try {
            decoded = deserializer.deserialize(topic, value);
        } catch (SerializationException e) {
            throw new UndecodableCommandException("Undecodable command record on " + topic + ": " + e.getMessage(), e);
        }
        if (decoded instanceof SpecificRecord command) {
            return command;
        }
        throw new UndecodableCommandException(
                "Not a command record on " + topic + ": " + (decoded == null ? "null" : decoded.getClass().getName()), null);
    }

    @PreDestroy
    void close() {
        deserializer.close();
    }
}
