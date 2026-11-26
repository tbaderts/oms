package org.example.streaming.kafka.errors;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.core.instrument.MeterRegistry;
import reactor.kafka.sender.KafkaSender;
import reactor.kafka.sender.SenderOptions;

/** The streaming service's Kafka error policy (SPEC-0077). */
@Configuration
@EnableConfigurationProperties(ErrorPolicyProperties.class)
public class ErrorPolicyConfig {

    @Bean
    public DeadLetters deadLetters(ErrorPolicyProperties properties) {
        return new DeadLetters(properties);
    }

    @Bean
    public DeadLetterMetrics deadLetterMetrics(MeterRegistry registry, ErrorPolicyProperties properties) {
        return new DeadLetterMetrics(registry, properties.serviceName());
    }

    /** The dead-letter topics of both receivers, created at startup. */
    @Bean
    @ConditionalOnProperty(prefix = "streaming.kafka", name = "enabled", havingValue = "true", matchIfMissing = true)
    public DeadLetterTopicProvisioner deadLetterTopicProvisioner(
            @Value("${spring.kafka.bootstrap-servers}") String bootstrapServers,
            @Value("${streaming.kafka.topics.orders}") String ordersTopic,
            @Value("${streaming.kafka.topics.executions}") String executionsTopic,
            @Value("${kafka.topics.replication-factor:1}") short replicationFactor,
            DeadLetters deadLetters) {
        return new DeadLetterTopicProvisioner(
                Map.of(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers),
                List.of(ordersTopic, executionsTopic),
                deadLetters,
                replicationFactor,
                30_000);
    }

    /** Writes dead letters: string keys, the value bytes as they arrived, retried for the window. */
    @Bean(destroyMethod = "close")
    @ConditionalOnProperty(prefix = "streaming.kafka", name = "enabled", havingValue = "true", matchIfMissing = true)
    public StreamingDeadLetterPublisher streamingDeadLetterPublisher(
            @Value("${spring.kafka.bootstrap-servers}") String bootstrapServers,
            ErrorPolicyProperties errorPolicy,
            DeadLetters deadLetters,
            DeadLetterMetrics metrics) {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class);
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        props.putAll(errorPolicy.producerTimeouts());
        return new StreamingDeadLetterPublisher(KafkaSender.create(SenderOptions.create(props)), deadLetters, metrics);
    }

    @Bean
    @ConditionalOnProperty(prefix = "streaming.kafka", name = "enabled", havingValue = "true", matchIfMissing = true)
    public RecordErrorPolicy recordErrorPolicy(ErrorPolicyProperties errorPolicy, StreamingDeadLetterPublisher publisher) {
        return new RecordErrorPolicy(errorPolicy, publisher);
    }
}
