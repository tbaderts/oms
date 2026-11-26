package org.example.oms.service;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.example.oms.kafka.errors.DeadLetterMetrics;
import org.example.oms.kafka.errors.DeadLetterSender;
import org.example.oms.kafka.errors.DeadLetters;
import org.example.oms.model.OutboxMessage;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.kafka.autoconfigure.KafkaProperties;
import org.springframework.stereotype.Component;

import io.confluent.kafka.serializers.KafkaAvroSerializer;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes an outbox message that cannot be published to {@code <topic>.oms-core.DLT} (SPEC-0077).
 *
 * <p>The value is the message's Avro record, serialized as the outbox would have sent it (under the
 * source topic's subject), so the dead-letter screen decodes it like any other. When that cannot be done (the record could not be
 * built, or the failure was the serialization itself), the value is a JSON document of the row with
 * {@code content-type: application/json}. Either way the record carries the failure headers and
 * {@code dlt-source: producer}.
 */
@Component
@Slf4j
@ConditionalOnProperty(prefix = "kafka", name = "enabled", havingValue = "true", matchIfMissing = false)
public class OutboxDeadLetterPublisher {

    /** What happened to a dead letter. */
    public sealed interface Outcome {
        /** On the dead-letter topic. */
        record DeadLettered(String topic) implements Outcome {}
        /** The broker could not be reached: try again on a later drain. */
        record Unreachable(Throwable failure) implements Outcome {}
        /** The dead-letter topic refused it for good. */
        record Refused(Throwable failure) implements Outcome {}
    }

    static final long SEND_TIMEOUT_MS = 10_000;

    private final DeadLetterSender sender;
    private final KafkaAvroSerializer serializer;
    private final DeadLetters deadLetters;
    private final DeadLetterMetrics metrics;
    private final JsonMapper json = JsonMapper.builder().findAndAddModules().build();

    /** {@code sender} is the outbox's own publisher: the outbox reaches Kafka through it alone (P-06). */
    public OutboxDeadLetterPublisher(
            DeadLetterSender sender, KafkaProperties kafkaProperties, DeadLetters deadLetters, DeadLetterMetrics metrics) {
        this.sender = sender;
        this.serializer = new KafkaAvroSerializer();
        // The outbox producer's settings: the same registry and subject strategy as the original send.
        this.serializer.configure(kafkaProperties.buildProducerProperties(), false);
        this.deadLetters = deadLetters;
        this.metrics = metrics;
    }

    /**
     * Dead-letters {@code row}, whose Avro {@code record} may be null when it could not be built. Blocks
     * up to {@link #SEND_TIMEOUT_MS}: it runs on the drain thread, which applies the outcome.
     */
    public Outcome deadLetter(OutboxMessage row, Object record, Throwable failure) {
        String topic = deadLetters.topicFor(row.getTopic());
        byte[] avro = null;
        if (record != null) {
            try {
                // Under the source topic's subject, which is registered: the dead-letter topic's own
                // subject is not, and the services run with auto.register.schemas=false.
                avro = serializer.serialize(row.getTopic(), record);
            } catch (RuntimeException e) {
                if (OutboxRelay.isTransient(e)) {
                    return new Outcome.Unreachable(e);
                }
            }
        }
        ProducerRecord<String, byte[]> dead =
                new ProducerRecord<>(topic, row.getAggregateId(), avro != null ? avro : document(row, record));
        deadLetters.addFailure(dead.headers(), row.getTopic(), failure, DeadLetters.PRODUCER);
        if (avro == null) {
            dead.headers().add("content-type", "application/json".getBytes(StandardCharsets.UTF_8));
        }
        Throwable sendFailure = send(() -> sender.sendBytes(dead).get(SEND_TIMEOUT_MS, TimeUnit.MILLISECONDS));
        if (sendFailure == null) {
            return deadLettered(row, topic, failure);
        }
        if (OutboxRelay.isTransient(sendFailure)) {
            return new Outcome.Unreachable(sendFailure);
        }
        metrics.deadLetterFailed(row.getTopic());
        log.error("Dead-letter topic {} refused outbox message {} ({} {}): {}",
                topic, row.getId(), row.getAggregateType(), row.getAggregateId(), sendFailure.toString());
        return new Outcome.Refused(sendFailure);
    }

    @PreDestroy
    void close() {
        serializer.close();
    }

    private Outcome deadLettered(OutboxMessage row, String topic, Throwable failure) {
        metrics.deadLettered(row.getTopic(), DeadLetters.PRODUCER, failure);
        log.error("Outbox message {} ({} {}) dead-lettered to {}: {}. It holds the later messages of {} on {}.",
                row.getId(), row.getAggregateType(), row.getAggregateId(), topic, failure.toString(),
                row.getAggregateId(), row.getTopic());
        return new Outcome.DeadLettered(topic);
    }

    private interface Send {
        void run() throws Exception;
    }

    /** Null when sent, else the failure, unwrapped. */
    private static Throwable send(Send send) {
        try {
            send.run();
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return e;
        } catch (ExecutionException e) {
            return e.getCause() != null ? e.getCause() : e;
        } catch (TimeoutException e) {
            return new org.apache.kafka.common.errors.TimeoutException("dead-letter send timed out", e);
        } catch (Exception e) {
            return e;
        }
    }

    /** The row as JSON: its identity, and its payload as Avro JSON, its JSON column, or base64 bytes. */
    byte[] document(OutboxMessage row, Object record) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("outboxId", row.getId());
        doc.put("topic", row.getTopic());
        doc.put("key", row.getAggregateId());
        doc.put("aggregateType", row.getAggregateType() == null ? null : row.getAggregateType().name());
        doc.put("aggregateVersion", row.getAggregateVersion());
        doc.put("orderId", row.getOrderId());
        doc.put("execId", row.getExecId());
        doc.put("createdAt", row.getCreatedAt() == null ? null : row.getCreatedAt().toString());
        doc.put("attempts", row.getAttempts());
        doc.put("lastError", row.getLastError());
        if (record != null) {
            doc.put("payloadAvroJson", record.toString());
        } else if (row.getOrderPayload() != null) {
            doc.put("payload", row.getOrderPayload());
        } else if (row.getExecutionPayload() != null) {
            doc.put("payload", row.getExecutionPayload());
        } else if (row.getPayload() != null) {
            doc.put("payloadType", row.getPayloadType());
            doc.put("payloadSchemaId", row.getPayloadSchemaId());
            doc.put("payloadBase64", Base64.getEncoder().encodeToString(row.getPayload()));
        }
        try {
            return json.writeValueAsBytes(doc);
        } catch (RuntimeException e) {
            // A payload model Jackson cannot write: keep the identity, drop the payload.
            doc.remove("payload");
            doc.put("payloadError", e.toString());
            return json.writeValueAsBytes(doc);
        }
    }
}
