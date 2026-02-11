package org.example.streaming.config;

import java.util.HashMap;
import java.util.Map;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.OrderMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.confluent.kafka.serializers.KafkaAvroDeserializer;
import io.confluent.kafka.serializers.KafkaAvroDeserializerConfig;
import reactor.kafka.receiver.KafkaReceiver;
import reactor.kafka.receiver.ReceiverOptions;

/**
 * Reactive Kafka configuration for consuming order and execution events.
 * 
 * <p>Uses reactor-kafka for non-blocking event consumption that integrates
 * seamlessly with Spring WebFlux and RSocket streaming.
 * 
 * <p>Consumes Avro-serialized messages from OMS using Confluent Schema Registry.
 */
@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;

    @Value("${spring.kafka.consumer.group-id}")
    private String groupId;

    @Value("${spring.kafka.properties.schema.registry.url}")
    private String schemaRegistryUrl;

    @Value("${streaming.kafka.topics.orders}")
    private String ordersTopic;

    @Value("${streaming.kafka.topics.executions}")
    private String executionsTopic;

    /**
     * Creates base consumer properties for Kafka receivers with Avro deserialization.
     */
    private Map<String, Object> consumerProperties() {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, KafkaAvroDeserializer.class);
        props.put(KafkaAvroDeserializerConfig.SCHEMA_REGISTRY_URL_CONFIG, schemaRegistryUrl);
        props.put(KafkaAvroDeserializerConfig.SPECIFIC_AVRO_READER_CONFIG, true);
        return props;
    }

    /**
     * Kafka receiver for order messages (Avro).
     * 
     * <p>Consumes OrderMessage Avro records from the orders topic.
     */
    @Bean
    public KafkaReceiver<String, OrderMessage> orderMessageReceiver() {
        Map<String, Object> props = consumerProperties();
        
        ReceiverOptions<String, OrderMessage> receiverOptions = ReceiverOptions
                .<String, OrderMessage>create(props)
                .subscription(java.util.Collections.singleton(ordersTopic));
        
        return KafkaReceiver.create(receiverOptions);
    }

    /**
     * Kafka receiver for execution messages (Avro).
     * 
     * <p>Consumes Execution Avro records from the executions topic.
     */
    @Bean
    public KafkaReceiver<String, Execution> executionReceiver() {
        Map<String, Object> props = consumerProperties();
        
        ReceiverOptions<String, Execution> receiverOptions = ReceiverOptions
                .<String, Execution>create(props)
                .subscription(java.util.Collections.singleton(executionsTopic));
        
        return KafkaReceiver.create(receiverOptions);
    }
}
