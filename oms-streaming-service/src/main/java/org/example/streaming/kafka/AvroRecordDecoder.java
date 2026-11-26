package org.example.streaming.kafka;

import java.util.Map;

import org.apache.kafka.common.errors.SerializationException;

import io.confluent.kafka.serializers.KafkaAvroDeserializer;
import io.confluent.kafka.serializers.KafkaAvroDeserializerConfig;

/**
 * Decodes the Avro records the streaming service consumes (SPEC-0077). The receivers read values as
 * bytes and decode them here, per record, so a record that cannot be decoded is an ordinary failure of
 * that record (dead-lettered with the bytes it arrived with) instead of an error that stops the stream.
 *
 * <p>A failure is a Kafka {@link SerializationException} with the cause: bad bytes are not retried,
 * while the schema registry being unreachable (an I/O cause) is, by the error policy.
 */
public class AvroRecordDecoder implements AutoCloseable {

    private final KafkaAvroDeserializer deserializer = new KafkaAvroDeserializer();

    public AvroRecordDecoder(String schemaRegistryUrl) {
        deserializer.configure(Map.of(
                KafkaAvroDeserializerConfig.SCHEMA_REGISTRY_URL_CONFIG, schemaRegistryUrl,
                KafkaAvroDeserializerConfig.SPECIFIC_AVRO_READER_CONFIG, true), false);
    }

    /** The record of type {@code type} encoded in {@code value}. */
    public <T> T decode(String topic, byte[] value, Class<T> type) {
        if (value == null || value.length == 0) {
            throw new SerializationException("Empty record on " + topic);
        }
        Object decoded = deserializer.deserialize(topic, value);
        if (!type.isInstance(decoded)) {
            throw new SerializationException("Not a " + type.getSimpleName() + " on " + topic + ": "
                    + (decoded == null ? "null" : decoded.getClass().getName()));
        }
        return type.cast(decoded);
    }

    @Override
    public void close() {
        deserializer.close();
    }
}
