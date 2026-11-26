package org.example.streaming.kafka.errors;

import java.time.Duration;
import java.util.function.Consumer;

import reactor.core.publisher.Mono;
import reactor.kafka.receiver.ReceiverRecord;
import reactor.util.retry.Retry;

/**
 * Handles one consumed record by the error policy (SPEC-0077), for the Reactor Kafka receivers.
 *
 * <p>The handler runs; a retryable failure is retried with the policy's back-off until
 * {@code retry-for} has passed since the record first failed; a failure that cannot succeed, or one
 * that outlasted the window, is dead-lettered. The record's offset is acknowledged only once it was
 * handled or dead-lettered, so a record is never skipped: if the dead letter itself fails, the error
 * propagates and the receiver resumes from the last committed offset.
 */
public class RecordErrorPolicy {

    private final ErrorPolicyProperties properties;
    private final StreamingDeadLetterPublisher deadLetters;

    public RecordErrorPolicy(ErrorPolicyProperties properties, StreamingDeadLetterPublisher deadLetters) {
        this.properties = properties;
        this.deadLetters = deadLetters;
    }

    public Mono<Void> process(ReceiverRecord<String, byte[]> record, Consumer<ReceiverRecord<String, byte[]>> handler) {
        long firstFailure = System.nanoTime();
        return Mono.<Void>fromRunnable(() -> handler.accept(record))
                .retryWhen(Retry.from(signals -> signals.concatMap(signal -> {
                    Throwable failure = signal.failure();
                    Duration elapsed = Duration.ofNanos(System.nanoTime() - firstFailure);
                    if (!ErrorClassifier.isRetryable(failure) || elapsed.compareTo(properties.retryFor()) >= 0) {
                        return Mono.error(failure);
                    }
                    return Mono.delay(properties.backOffBefore((int) signal.totalRetries() + 1));
                })))
                .onErrorResume(failure -> deadLetters.deadLetter(record, failure))
                .then(Mono.fromRunnable(() -> record.receiverOffset().acknowledge()));
    }
}
