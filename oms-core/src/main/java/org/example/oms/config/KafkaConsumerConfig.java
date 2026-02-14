package org.example.oms.config;

import java.util.Map;

import org.example.common.model.msg.CommandMessage;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;

@Configuration
@EnableKafka
public class KafkaConsumerConfig {

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, CommandMessage> kafkaListenerContainerFactory(
            ConsumerFactory<?, ?> consumerFactory) {
        ConcurrentKafkaListenerContainerFactory<String, CommandMessage> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(defaultConsumerFactory(consumerFactory));
        return factory;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private ConsumerFactory<String, CommandMessage> defaultConsumerFactory(
            ConsumerFactory<?, ?> consumerFactory) {
        Map<String, Object> consumerProps = ((DefaultKafkaConsumerFactory<?, ?>) consumerFactory).getConfigurationProperties();
        return new DefaultKafkaConsumerFactory<>(consumerProps);
    }
}
