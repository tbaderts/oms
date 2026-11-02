package org.example.oms.integration;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.example.common.model.msg.CommandHeader;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

import io.confluent.kafka.serializers.KafkaAvroDeserializer;
import io.confluent.kafka.serializers.subject.TopicRecordNameStrategy;

/**
 * Producing commands in tests as the exchange simulator does (SPEC-0025): bare command records,
 * each under its own subject, with a header.
 */
final class TestCommands {

    static final String PRODUCER = "oms-core-it";

    private TestCommands() {}

    /** A header with a fresh commandId. */
    static CommandHeader header() {
        return header(UUID.randomUUID().toString());
    }

    static CommandHeader header(String commandId) {
        return CommandHeader.newBuilder()
                .setCommandId(commandId)
                .setSentAt(Instant.now())
                .setProducer(PRODUCER)
                .build();
    }

    /**
     * Consumer overrides for reading the event topics. The application's consumer reads command
     * values as bytes (they are decoded by {@code CommandDecoder}); a test reading events wants the
     * Avro records.
     */
    static Properties avroValues() {
        Properties properties = new Properties();
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, KafkaAvroDeserializer.class.getName());
        return properties;
    }

    /**
     * A template that writes command records under {@code commands-<record full name>}, from the
     * application's producer settings (registry and serializers).
     */
    static KafkaTemplate<String, Object> commandTemplate(ProducerFactory<?, ?> producerFactory) {
        Map<String, Object> config = new HashMap<>(producerFactory.getConfigurationProperties());
        config.put("value.subject.name.strategy", TopicRecordNameStrategy.class.getName());
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(config));
    }
}
