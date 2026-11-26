package org.example.simulator.kafka.errors;

import java.util.List;

import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.header.Headers;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.example.simulator.config.SimulatorProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.kafka.autoconfigure.DefaultKafkaProducerFactoryCustomizer;
import org.springframework.boot.kafka.autoconfigure.KafkaProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.BackOff;
import org.springframework.util.backoff.FixedBackOff;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/**
 * The simulator's Kafka error policy (SPEC-0077).
 *
 * <ul>
 *   <li>The order listener runs with {@link #orderErrorHandler}: retryable failures back off for the
 *       window, the rest (and the expired ones) go to {@code oms_orders.oms-exchange-simulator.DLT}
 *       with the bytes they arrived with. Boot applies this {@code CommonErrorHandler} bean to its
 *       listener container factory.
 *   <li>The command producer retries a retriable send for the window inside the client
 *       ({@link #errorPolicyProducerTimeouts}); what still fails is dead-lettered by the gateway.
 *   <li>Both dead-letter topics are created at startup.
 * </ul>
 */
@Configuration
@EnableConfigurationProperties(ErrorPolicyProperties.class)
@Slf4j
public class KafkaErrorHandlingConfig {

    @Bean
    public DeadLetters deadLetters(ErrorPolicyProperties properties) {
        return new DeadLetters(properties);
    }

    @Bean
    public DeadLetterMetrics deadLetterMetrics(MeterRegistry registry, ErrorPolicyProperties properties) {
        return new DeadLetterMetrics(registry, properties.serviceName());
    }

    @Bean
    public DeadLetterTopicProvisioner deadLetterTopicProvisioner(
            KafkaAdmin kafkaAdmin,
            SimulatorProperties simulator,
            DeadLetters deadLetters,
            @Value("${kafka.topics.replication-factor:1}") short replicationFactor) {
        return new DeadLetterTopicProvisioner(
                kafkaAdmin.getConfigurationProperties(),
                List.of(simulator.orderTopic(), simulator.commandTopic()),
                deadLetters,
                replicationFactor,
                30_000);
    }

    /** The client retries a retriable send error for the error policy's window. */
    @Bean
    public DefaultKafkaProducerFactoryCustomizer errorPolicyProducerTimeouts(ErrorPolicyProperties errorPolicy) {
        return factory -> factory.updateConfigs(errorPolicy.producerTimeouts());
    }

    /**
     * Writes dead letters as raw bytes: consumer dead letters keep exactly what arrived, producer dead
     * letters carry what the gateway could encode.
     */
    @Bean(destroyMethod = "close")
    public DeadLetterProducer deadLetterProducer(KafkaProperties kafkaProperties, ErrorPolicyProperties errorPolicy) {
        return new DeadLetterProducer(kafkaProperties.buildProducerProperties(), errorPolicy);
    }

    /** Retries retryable failures for the window, dead-letters the rest at once (SPEC-0077). */
    @Bean
    public DefaultErrorHandler orderErrorHandler(
            DeadLetterProducer deadLetterProducer,
            ErrorPolicyProperties errorPolicy,
            DeadLetters deadLetters,
            DeadLetterMetrics deadLetterMetrics) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
                deadLetterProducer.template(),
                (record, exception) -> {
                    String destination = deadLetters.topicFor(record.topic());
                    log.error("Routing record from {}-{} offset {} to {} after failure: {}",
                            record.topic(), record.partition(), record.offset(), destination, exception.getMessage());
                    deadLetterMetrics.deadLettered(record.topic(), DeadLetters.CONSUMER, exception);
                    return new TopicPartition(destination, record.partition());
                });
        recoverer.setHeadersFunction((record, exception) -> {
            Headers extra = new RecordHeaders();
            deadLetters.addSource(extra, DeadLetters.CONSUMER);
            return extra;
        });
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, errorPolicy.windowBackOff());
        BackOff noRetry = new FixedBackOff(0, 0);
        handler.setBackOffFunction((record, failure) -> ErrorClassifier.isRetryable(failure) ? errorPolicy.windowBackOff() : noRetry);
        return handler;
    }
}
