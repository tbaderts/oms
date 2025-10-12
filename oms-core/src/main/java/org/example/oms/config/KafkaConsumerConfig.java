package org.example.oms.config;

import java.util.Map;

import org.springframework.boot.autoconfigure.kafka.KafkaProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;

import lombok.AllArgsConstructor;

@Configuration
@EnableKafka
@AllArgsConstructor
public class KafkaConsumerConfig {

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> kafkaListenerContainerFactory(
            KafkaProperties kafkaProperties) {
        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(defaultConsumerFactory(kafkaProperties));
        return factory;
    }

    private ConsumerFactory<String, String> defaultConsumerFactory(
            KafkaProperties kafkaProperties) {
        Map<String, Object> consumerProps = kafkaProperties.buildConsumerProperties(null);
        return new DefaultKafkaConsumerFactory<>(consumerProps);
    }
}
