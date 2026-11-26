package org.example.simulator.kafka;

import org.example.common.model.msg.OrderMessage;
import org.springframework.boot.kafka.autoconfigure.KafkaProperties;
import org.springframework.kafka.support.serializer.DeserializationException;
import org.springframework.stereotype.Component;

import io.confluent.kafka.serializers.KafkaAvroDeserializer;
import jakarta.annotation.PreDestroy;

/**
 * Decodes the OMS's order records (SPEC-0077). The listener consumes the value as bytes and decodes it
 * here, so a record that cannot be handled reaches the dead-letter topic with exactly the bytes it
 * arrived with, and a decode failure is an ordinary failure of that record.
 *
 * <p>A failure is a {@link DeserializationException} carrying the cause: bad bytes are not retried,
 * while the schema registry being unreachable (an I/O cause) is, by the error policy.
 */
@Component
public class OrderMessageDecoder {

    private final KafkaAvroDeserializer deserializer = new KafkaAvroDeserializer();

    public OrderMessageDecoder(KafkaProperties kafkaProperties) {
        deserializer.configure(kafkaProperties.buildConsumerProperties(), false);
    }

    public OrderMessage decode(String topic, byte[] value) {
        if (value == null || value.length == 0) {
            throw new DeserializationException("Empty order record on " + topic, value, false, null);
        }
        Object decoded;
        try {
            decoded = deserializer.deserialize(topic, value);
        } catch (RuntimeException e) {
            throw new DeserializationException("Undecodable order record on " + topic + ": " + e.getMessage(), value, false, e);
        }
        if (decoded instanceof OrderMessage message) {
            return message;
        }
        throw new DeserializationException(
                "Not an OrderMessage on " + topic + ": " + (decoded == null ? "null" : decoded.getClass().getName()), value, false, null);
    }

    @PreDestroy
    void close() {
        deserializer.close();
    }
}
