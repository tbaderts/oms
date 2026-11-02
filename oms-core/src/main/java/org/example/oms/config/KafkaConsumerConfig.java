package org.example.oms.config;

import java.util.Map;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.kafka.autoconfigure.KafkaProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.serializer.DeserializationException;
import org.springframework.util.backoff.ExponentialBackOff;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;

/**
 * Consumer wiring for the command topic.
 *
 * <p>The important part is the error handler. Without one, a command that failed to process was
 * committed as consumed and silently dropped — for an OMS that means a lost fill nobody notices
 * until reconciliation. Failures now retry with backoff and then land on a dead-letter topic where
 * they can be inspected and replayed.
 *
 * <p>Command values are consumed as bytes and decoded by {@link CommandDecoder} (SPEC-0025), so
 * every dead letter carries the record exactly as it arrived, schema id included.
 */
@Configuration
@EnableKafka
@Slf4j
public class KafkaConsumerConfig {

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, byte[]>
            kafkaListenerContainerFactory(
                    ConsumerFactory<String, byte[]> consumerFactory,
                    DefaultErrorHandler commandErrorHandler) {

        ConcurrentKafkaListenerContainerFactory<String, byte[]> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setCommonErrorHandler(commandErrorHandler);
        return factory;
    }

    /**
     * Republishes failed command records unchanged: string key, raw value bytes. Kept apart from the
     * Avro template the outbox uses, which would re-encode the value under a subject of its own.
     */
    @Bean
    public KafkaTemplate<String, byte[]> deadLetterTemplate(KafkaProperties kafkaProperties) {
        Map<String, Object> config = kafkaProperties.buildProducerProperties();
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        // Not a bean: a second ProducerFactory bean would switch off Boot's own, which the outbox uses.
        // Closed here on shutdown instead.
        deadLetterProducerFactory = new DefaultKafkaProducerFactory<>(config);
        return new KafkaTemplate<>(deadLetterProducerFactory);
    }

    private DefaultKafkaProducerFactory<String, byte[]> deadLetterProducerFactory;

    @PreDestroy
    void closeDeadLetterProducer() {
        if (deadLetterProducerFactory != null) {
            deadLetterProducerFactory.destroy();
        }
    }

    /**
     * Retries transient failures, then routes to {@code <topic>.DLT}.
     *
     * <p>Records that cannot be read or handled skip the retries: a malformed payload or an unknown
     * command type will not succeed on a second attempt, so retrying only delays the inevitable and
     * blocks the partition meanwhile.
     */
    @Bean
    public DefaultErrorHandler commandErrorHandler(
            KafkaTemplate<String, byte[]> deadLetterTemplate,
            @Value("${kafka.consumer.retry-attempts:4}") int retryAttempts,
            @Value("${kafka.consumer.retry-initial-interval-ms:500}") long initialInterval) {

        DeadLetterPublishingRecoverer recoverer =
                new DeadLetterPublishingRecoverer(
                        deadLetterTemplate,
                        (record, exception) -> {
                            log.error(
                                    "Routing record from {}-{} offset {} to DLT after failure: {}",
                                    record.topic(),
                                    record.partition(),
                                    record.offset(),
                                    exception.getMessage());
                            return new TopicPartition(record.topic() + ".DLT", record.partition());
                        });

        ExponentialBackOff backOff = new ExponentialBackOff(initialInterval, 2.0);
        backOff.setMaxAttempts(retryAttempts);

        DefaultErrorHandler errorHandler = new DefaultErrorHandler(recoverer, backOff);
        errorHandler.addNotRetryableExceptions(
                DeserializationException.class, IllegalArgumentException.class);
        return errorHandler;
    }
}
