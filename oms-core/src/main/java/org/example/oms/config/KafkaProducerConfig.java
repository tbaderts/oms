package org.example.oms.config;

import org.example.common.model.msg.OrderMessage;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.EnableKafka;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

@Configuration
@EnableKafka
public class KafkaProducerConfig {

    @SuppressWarnings({"unchecked", "rawtypes"})
    @Bean
    public KafkaTemplate<String, OrderMessage> kafkaTemplate(ProducerFactory<?, ?> producerFactory) {
        return new KafkaTemplate((ProducerFactory) producerFactory);
    }
}
