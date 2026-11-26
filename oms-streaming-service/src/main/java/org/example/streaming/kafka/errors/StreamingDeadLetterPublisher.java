package org.example.streaming.kafka.errors;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerRecord;

import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;
import reactor.kafka.sender.KafkaSender;
import reactor.kafka.sender.SenderRecord;

/**
 * Writes a consumed record the streaming service could not handle to {@code <topic>.oms-streaming-service.DLT}
 * (SPEC-0077): same key, same value bytes, same partition number, with the failure headers. Completes
 * when the broker acknowledged it; fails when it could not be written, and then the record is not
 * acknowledged either.
 */
@Slf4j
public class StreamingDeadLetterPublisher implements AutoCloseable {

    private final KafkaSender<String, byte[]> sender;
    private final DeadLetters deadLetters;
    private final DeadLetterMetrics metrics;

    public StreamingDeadLetterPublisher(KafkaSender<String, byte[]> sender, DeadLetters deadLetters, DeadLetterMetrics metrics) {
        this.sender = sender;
        this.deadLetters = deadLetters;
        this.metrics = metrics;
    }

    public Mono<Void> deadLetter(ConsumerRecord<String, byte[]> record, Throwable failure) {
        String topic = deadLetters.topicFor(record.topic());
        ProducerRecord<String, byte[]> dead = new ProducerRecord<>(topic, record.partition(), record.key(), record.value());
        record.headers().forEach(h -> dead.headers().add(h));
        deadLetters.addConsumerFailure(dead.headers(), record.topic(), record.partition(), record.offset(), record.timestamp(), failure);
        return sender.send(Mono.just(SenderRecord.create(dead, null)))
                .next()
                .flatMap(result -> result.exception() == null ? Mono.empty() : Mono.error(result.exception()))
                .doOnSuccess(ignored -> {
                    metrics.deadLettered(record.topic(), DeadLetters.CONSUMER, failure);
                    log.error("Routing record from {}-{} offset {} to {} after failure: {}",
                            record.topic(), record.partition(), record.offset(), topic, failure.toString());
                })
                .doOnError(dltFailure -> {
                    metrics.deadLetterFailed(record.topic());
                    log.error("Record from {}-{} offset {} could not be dead-lettered to {}: {}",
                            record.topic(), record.partition(), record.offset(), topic, dltFailure.toString());
                })
                .then();
    }

    @Override
    public void close() {
        sender.close();
    }
}
