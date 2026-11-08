package org.example.oms.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaAdmin;

/** oms-core's topics, declared at startup (SPEC-0048). */
@Configuration
@ConditionalOnProperty(prefix = "kafka", name = "enabled", havingValue = "true", matchIfMissing = false)
public class KafkaTopicsConfig {

    @Bean
    public KafkaTopicProvisioner kafkaTopicProvisioner(
            KafkaAdmin kafkaAdmin,
            @Value("${kafka.command-topic}") String commandTopic,
            @Value("${kafka.order-topic}") String orderTopic,
            @Value("${kafka.execution-topic}") String executionTopic,
            @Value("${kafka.order-execution-topic}") String orderExecutionTopic,
            @Value("${kafka.topics.partitions:6}") int partitions,
            @Value("${kafka.topics.replication-factor:1}") short replicationFactor,
            @Value("${kafka.topics.provision-timeout-ms:30000}") long timeoutMs) {
        return new KafkaTopicProvisioner(
                kafkaAdmin.getConfigurationProperties(),
                List.of(commandTopic, orderTopic, executionTopic, orderExecutionTopic),
                commandTopic,
                partitions,
                replicationFactor,
                timeoutMs);
    }
}
