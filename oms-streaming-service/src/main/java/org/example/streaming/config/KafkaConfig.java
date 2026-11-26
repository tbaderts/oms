package org.example.streaming.config;

import java.util.HashMap;
import java.util.Map;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.example.streaming.kafka.AvroRecordDecoder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.micrometer.observation.ObservationRegistry;
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
/**
 * The two receivers (orders, executions). Values are read as bytes and decoded per record by
 * {@link AvroRecordDecoder} (SPEC-0077), so a record that cannot be decoded is dead-lettered with the
 * bytes it arrived with instead of stopping the stream.
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
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class);
        return props;
    }

    @Bean(destroyMethod = "close")
    public AvroRecordDecoder avroRecordDecoder() {
        return new AvroRecordDecoder(schemaRegistryUrl);
    }

    /**
     * Kafka receiver for order messages (Avro).
     * 
     * <p>Consumes OrderMessage Avro records from the orders topic.
     */
    @Bean
    public KafkaReceiver<String, byte[]> orderMessageReceiver(ObservationRegistry observationRegistry) {
        return KafkaReceiver.create(receiverOptions(ordersTopic, observationRegistry));
    }

    /**
     * Kafka receiver for fills (Avro), SPEC-0071: Execution records from {@code oms_executions}, the
     * fill as the venue reported it. The order as of the fill ({@code oms_order_executions}) is for
     * booking and downstream systems, not the blotter.
     */
    @Bean
    public KafkaReceiver<String, byte[]> executionReceiver(ObservationRegistry observationRegistry) {
        return KafkaReceiver.create(executionReceiverOptions(observationRegistry));
    }

    /**
     * Options for the fills topic. A first start reads new fills only ({@code latest}): history comes
     * from the database snapshot each subscription takes, so replaying the topic would only resend
     * past fills as live events. Later starts resume from the committed offset.
     */
    ReceiverOptions<String, byte[]> executionReceiverOptions(ObservationRegistry observationRegistry) {
        return receiverOptions(executionsTopic, observationRegistry)
                .consumerProperty(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
    }

    /**
     * Options for one topic. Each received record is observed: its consumer span continues the trace
     * of the oms-core producer, from the record's {@code traceparent} header (SPEC-0033).
     */
    ReceiverOptions<String, byte[]> receiverOptions(String topic, ObservationRegistry observationRegistry) {
        return ReceiverOptions.<String, byte[]>create(consumerProperties())
                .subscription(java.util.Collections.singleton(topic))
                .withObservation(observationRegistry);
    }
}
