package org.example.oms.config;

import java.util.Map;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.header.Headers;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.example.oms.kafka.errors.DeadLetterMetrics;
import org.example.oms.kafka.errors.DeadLetters;
import org.example.oms.kafka.errors.ErrorClassifier;
import org.example.oms.kafka.errors.ErrorPolicyProperties;
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
import org.springframework.util.backoff.BackOff;
import org.springframework.util.backoff.FixedBackOff;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;

/**
 * Consumer wiring for the command topic.
 *
 * <p>The important part is the error handler. Without one, a command that failed to process was
 * committed as consumed and silently dropped — for an OMS that means a lost fill nobody notices
 * until reconciliation. Failures now retry with backoff and then land on a dead-letter topic where
 * they can be inspected and replayed (SPEC-0077: {@code <topic>.oms-core.DLT}, by the error policy).
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
                    DefaultErrorHandler commandErrorHandler,
                    org.springframework.beans.factory.ObjectProvider<KafkaTopicProvisioner> topics) {

        ConcurrentKafkaListenerContainerFactory<String, byte[]> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setCommonErrorHandler(commandErrorHandler);
        // One consumer per partition of the command topic (SPEC-0048). Safe for per-order ordering: the
        // key is the root order id, so one order's commands share a partition, hence a consumer.
        topics.ifAvailable(provisioner -> factory.setConcurrency(provisioner.commandPartitions()));
        // A consumer span per command, continuing the producer's trace from the record headers
        // (SPEC-0033).
        factory.getContainerProperties().setObservationEnabled(true);
        return factory;
    }

    /**
     * Republishes failed command records unchanged: string key, raw value bytes. Kept apart from the
     * Avro template the outbox uses, which would re-encode the value under a subject of its own.
     */
    @Bean
    public KafkaTemplate<String, byte[]> deadLetterTemplate(KafkaProperties kafkaProperties, ErrorPolicyProperties errorPolicy) {
        Map<String, Object> config = kafkaProperties.buildProducerProperties();
        config.putAll(errorPolicy.producerTimeouts());
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        // Not a bean: a second ProducerFactory bean would switch off Boot's own, which the outbox uses.
        // Closed here on shutdown instead.
        deadLetterProducerFactory = new DefaultKafkaProducerFactory<>(config);
        KafkaTemplate<String, byte[]> template = new KafkaTemplate<>(deadLetterProducerFactory);
        template.setObservationEnabled(true);
        return template;
    }

    private DefaultKafkaProducerFactory<String, byte[]> deadLetterProducerFactory;

    @PreDestroy
    void closeDeadLetterProducer() {
        if (deadLetterProducerFactory != null) {
            deadLetterProducerFactory.destroy();
        }
    }

    /**
     * The error policy for the command topic (SPEC-0077): retries retryable failures for
     * {@code kafka.error-policy.retry-for}, then routes to {@code <topic>.oms-core.DLT}.
     *
     * <p>Records that cannot succeed on a retry skip the retries ({@link ErrorClassifier}): a
     * malformed payload, an unknown command type, a programming error or a permission error would
     * only block the partition while the inevitable is delayed. A concurrency failure is retried until
     * it clears and never dead-lettered (SPEC-0048).
     */
    @Bean
    public DefaultErrorHandler commandErrorHandler(
            KafkaTemplate<String, byte[]> deadLetterTemplate,
            ErrorPolicyProperties errorPolicy,
            DeadLetters deadLetters,
            DeadLetterMetrics deadLetterMetrics,
            @Value("${kafka.consumer.concurrency-max-interval-ms:5000}") long concurrencyMaxIntervalMs,
            @Value("${kafka.consumer.concurrency-error-after-attempts:120}") int concurrencyErrorAfterAttempts) {

        DeadLetterPublishingRecoverer recoverer =
                new DeadLetterPublishingRecoverer(
                        deadLetterTemplate,
                        (record, exception) -> {
                            String destination = deadLetters.topicFor(record.topic());
                            log.error(
                                    "Routing record from {}-{} offset {} to {} after failure: {}",
                                    record.topic(),
                                    record.partition(),
                                    record.offset(),
                                    destination,
                                    exception.getMessage());
                            deadLetterMetrics.deadLettered(record.topic(), DeadLetters.CONSUMER, exception);
                            return new TopicPartition(destination, record.partition());
                        });
        recoverer.setHeadersFunction((record, exception) -> {
            Headers extra = new RecordHeaders();
            deadLetters.addSource(extra, DeadLetters.CONSUMER);
            return extra;
        });

        DefaultErrorHandler errorHandler = new DefaultErrorHandler(recoverer, errorPolicy.windowBackOff());

        // Precedence (design D-5): a concurrency failure is retried until the competing command has
        // committed; otherwise a failure that cannot succeed is dead-lettered at once, and the rest
        // back off until the window has passed.
        BackOff concurrency = CommandBackOffs.concurrencyBackOff(errorPolicy.initialInterval().toMillis(), concurrencyMaxIntervalMs);
        BackOff noRetry = new FixedBackOff(0, 0);
        errorHandler.setBackOffFunction((record, failure) -> {
            BackOff conflict = CommandBackOffs.backOffFor(failure, concurrency);
            if (conflict != null) {
                return conflict;
            }
            return ErrorClassifier.isRetryable(failure) ? errorPolicy.windowBackOff() : noRetry;
        });
        errorHandler.setRetryListeners((record, failure, attempt) -> {
            if (!CommandBackOffs.isConcurrencyFailure(failure)) {
                return;
            }
            if (attempt >= concurrencyErrorAfterAttempts) {
                log.error(
                        "Command {}-{} offset {} still conflicts after {} attempts; retrying: {}",
                        record.topic(), record.partition(), record.offset(), attempt, failure.getMessage());
            } else {
                log.warn(
                        "Command {}-{} offset {} conflicted with a concurrent command (attempt {}); retrying",
                        record.topic(), record.partition(), record.offset(), attempt);
            }
        });
        return errorHandler;
    }
}
