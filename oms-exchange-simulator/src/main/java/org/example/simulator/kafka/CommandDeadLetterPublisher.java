package org.example.simulator.kafka;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;

import org.apache.avro.specific.SpecificRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.example.simulator.kafka.errors.DeadLetterMetrics;
import org.example.simulator.kafka.errors.DeadLetterProducer;
import org.example.simulator.kafka.errors.DeadLetters;
import org.springframework.boot.kafka.autoconfigure.KafkaProperties;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import io.confluent.kafka.serializers.KafkaAvroSerializer;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;

/**
 * Writes a command the gateway could not send to {@code <command topic>.oms-exchange-simulator.DLT}
 * (SPEC-0077): the Avro bytes it would have been sent with, or, when it cannot be serialized, its Avro
 * JSON with {@code content-type: application/json}. If the dead-letter topic refuses it too, the loss
 * is logged with the order id and counted ({@code kafka.dead.letters.failed}); the order then stays as
 * it is in the OMS, as after a dropped venue connection.
 */
@Component
@Slf4j
public class CommandDeadLetterPublisher {

    private final KafkaTemplate<String, byte[]> template;
    private final KafkaAvroSerializer serializer;
    private final DeadLetters deadLetters;
    private final DeadLetterMetrics metrics;

    @org.springframework.beans.factory.annotation.Autowired
    public CommandDeadLetterPublisher(
            DeadLetterProducer producer, KafkaProperties kafkaProperties, DeadLetters deadLetters, DeadLetterMetrics metrics) {
        this(producer.template(), serializer(kafkaProperties), deadLetters, metrics);
    }

    CommandDeadLetterPublisher(
            KafkaTemplate<String, byte[]> template, KafkaAvroSerializer serializer, DeadLetters deadLetters, DeadLetterMetrics metrics) {
        this.template = template;
        this.serializer = serializer;
        this.deadLetters = deadLetters;
        this.metrics = metrics;
    }

    private static KafkaAvroSerializer serializer(KafkaProperties kafkaProperties) {
        KafkaAvroSerializer serializer = new KafkaAvroSerializer();
        // The command producer's settings: the same registry and subject strategy as the original send.
        serializer.configure(kafkaProperties.buildProducerProperties(), false);
        return serializer;
    }

    /** Dead-letters {@code command} for {@code orderId}; completes when settled, never exceptionally. */
    public CompletableFuture<Void> deadLetter(String sourceTopic, String orderId, SpecificRecord command, Throwable failure) {
        String topic = deadLetters.topicFor(sourceTopic);
        ProducerRecord<String, byte[]> record;
        try {
            record = new ProducerRecord<>(topic, orderId, serializer.serialize(sourceTopic, command));
        } catch (RuntimeException notSerializable) {
            record = new ProducerRecord<>(topic, orderId, command.toString().getBytes(StandardCharsets.UTF_8));
            record.headers().add("content-type", "application/json".getBytes(StandardCharsets.UTF_8));
        }
        deadLetters.addFailure(record.headers(), sourceTopic, failure, DeadLetters.PRODUCER);
        String type = command.getClass().getSimpleName();
        CompletableFuture<?> sent;
        try {
            sent = template.send(record);
        } catch (RuntimeException e) {
            sent = CompletableFuture.failedFuture(e);
        }
        return sent.handle((result, dltFailure) -> {
            if (dltFailure == null) {
                metrics.deadLettered(sourceTopic, DeadLetters.PRODUCER, failure);
                log.error("{} for order {} could not be sent and was dead-lettered to {}: {}", type, orderId, topic, failure.toString());
            } else {
                metrics.deadLetterFailed(sourceTopic);
                log.error("{} for order {} could not be sent ({}) nor dead-lettered to {} ({}); the order stays as it is in the OMS",
                        type, orderId, failure.toString(), topic, dltFailure.toString());
            }
            return null;
        });
    }

    @PreDestroy
    void close() {
        serializer.close();
    }
}
