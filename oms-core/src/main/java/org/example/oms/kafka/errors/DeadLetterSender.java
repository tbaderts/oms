package org.example.oms.kafka.errors;

import java.util.concurrent.CompletableFuture;

import org.apache.kafka.clients.producer.ProducerRecord;

/**
 * Sends a dead letter of the outbox to Kafka (SPEC-0077). Implemented by the outbox's own publisher,
 * so the outbox reaches Kafka through one component only (P-06); the dead-letter publisher decides
 * what to send and what an outcome means.
 */
public interface DeadLetterSender {

    /** Sends a dead letter's bytes (Avro, or a JSON document) with the dead-letter producer. */
    CompletableFuture<?> sendBytes(ProducerRecord<String, byte[]> record);
}
