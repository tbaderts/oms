package org.example.oms.config;

import org.apache.kafka.common.TopicPartition;
import org.example.common.model.msg.CommandMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.kafka.support.serializer.DeserializationException;
import org.springframework.util.backoff.ExponentialBackOff;

import lombok.extern.slf4j.Slf4j;

/**
 * Consumer wiring for the command topic.
 *
 * <p>The important part is the error handler. Without one, a command that failed to process was
 * committed as consumed and silently dropped — for an OMS that means a lost fill nobody notices
 * until reconciliation. Failures now retry with backoff and then land on a dead-letter topic where
 * they can be inspected and replayed.
 */
@Configuration
@EnableKafka
@Slf4j
public class KafkaConsumerConfig {

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, CommandMessage>
            kafkaListenerContainerFactory(
                    ConsumerFactory<String, CommandMessage> consumerFactory,
                    DefaultErrorHandler commandErrorHandler) {

        ConcurrentKafkaListenerContainerFactory<String, CommandMessage> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setCommonErrorHandler(commandErrorHandler);
        return factory;
    }

    /**
     * Retries transient failures, then routes to {@code <topic>.DLT}.
     *
     * <p>Deserialization failures skip the retries: a malformed payload will never parse on a second
     * attempt, so retrying it only delays the inevitable and blocks the partition meanwhile.
     */
    @Bean
    public DefaultErrorHandler commandErrorHandler(
            KafkaTemplate<String, Object> kafkaTemplate,
            @Value("${kafka.consumer.retry-attempts:4}") int retryAttempts,
            @Value("${kafka.consumer.retry-initial-interval-ms:500}") long initialInterval) {

        DeadLetterPublishingRecoverer recoverer =
                new DeadLetterPublishingRecoverer(
                        kafkaTemplate,
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
