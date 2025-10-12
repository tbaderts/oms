package org.example.oms.config;

import java.util.Map;

import org.example.common.model.msg.OrderMessage;
import org.springframework.boot.autoconfigure.kafka.KafkaProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;

import lombok.RequiredArgsConstructor;

@Configuration
@EnableKafka
@RequiredArgsConstructor
public class KafkaProducerConfig {

    @Bean
    public KafkaTemplate<String, OrderMessage> kafkaTemplate(KafkaProperties kafkaProperties) {
        Map<String, Object> kafkaPropertiesMap = kafkaProperties.buildProducerProperties(null);
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(kafkaPropertiesMap));
    }
}
