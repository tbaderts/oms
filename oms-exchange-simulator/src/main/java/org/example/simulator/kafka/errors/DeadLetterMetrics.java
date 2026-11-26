package org.example.simulator.kafka.errors;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

/**
 * Counts dead letters (SPEC-0077): {@code kafka.dead.letters{service, topic, side, exception}}, where
 * {@code topic} is the source topic and {@code exception} the simple name of the root cause, and
 * {@code kafka.dead.letters.failed{service, topic}} when the dead-letter topic itself refused one.
 */
public class DeadLetterMetrics {

    public static final String DEAD_LETTERS = "kafka.dead.letters";
    public static final String DEAD_LETTERS_FAILED = "kafka.dead.letters.failed";

    private final MeterRegistry registry;
    private final String service;

    public DeadLetterMetrics(MeterRegistry registry, String service) {
        this.registry = registry;
        this.service = service;
    }

    public void deadLettered(String sourceTopic, String side, Throwable failure) {
        Counter.builder(DEAD_LETTERS)
                .description("Records written to a dead-letter topic (SPEC-0077)")
                .tag("service", service)
                .tag("topic", sourceTopic)
                .tag("side", side)
                .tag("exception", ErrorClassifier.rootCause(failure).getClass().getSimpleName())
                .register(registry)
                .increment();
    }

    public void deadLetterFailed(String sourceTopic) {
        Counter.builder(DEAD_LETTERS_FAILED)
                .description("Dead letters the dead-letter topic refused (SPEC-0077)")
                .tag("service", service)
                .tag("topic", sourceTopic)
                .register(registry)
                .increment();
    }
}
