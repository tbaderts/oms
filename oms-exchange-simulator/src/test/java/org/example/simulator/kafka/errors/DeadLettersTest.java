package org.example.simulator.kafka.errors;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.apache.kafka.common.header.Headers;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.support.KafkaHeaders;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/** SPEC-0077: dead-letter topic names, headers and the dead-letter counter. */
class DeadLettersTest {

    private final DeadLetters deadLetters = new DeadLetters("oms-exchange-simulator");

    private static String text(Headers headers, String key) {
        return new String(headers.lastHeader(key).value(), StandardCharsets.UTF_8);
    }

    @Test
    void topicIsSourceServiceAndSuffix() {
        assertThat(deadLetters.topicFor("commands")).isEqualTo("commands.oms-exchange-simulator.DLT");
        assertThat(deadLetters.topicFor("oms_orders")).endsWith(DeadLetters.SUFFIX);
    }

    @Test
    void producerFailureHeadersMatchSpringsNames() {
        Headers headers = new RecordHeaders();
        deadLetters.addFailure(headers, "oms_orders", new IllegalStateException("send failed", new NullPointerException("value")), DeadLetters.PRODUCER);

        assertThat(text(headers, KafkaHeaders.DLT_EXCEPTION_FQCN)).isEqualTo(IllegalStateException.class.getName());
        assertThat(text(headers, KafkaHeaders.DLT_EXCEPTION_MESSAGE)).isEqualTo("send failed");
        assertThat(text(headers, KafkaHeaders.DLT_EXCEPTION_CAUSE_FQCN)).isEqualTo(NullPointerException.class.getName());
        assertThat(text(headers, KafkaHeaders.DLT_ORIGINAL_TOPIC)).isEqualTo("oms_orders");
        assertThat(text(headers, DeadLetters.HEADER_SOURCE)).isEqualTo("producer");
        assertThat(text(headers, DeadLetters.HEADER_SERVICE)).isEqualTo("oms-exchange-simulator");
        assertThat(headers.lastHeader(KafkaHeaders.DLT_ORIGINAL_TIMESTAMP).value()).hasSize(8);
        assertThat(text(headers, KafkaHeaders.DLT_EXCEPTION_STACKTRACE).length()).isLessThanOrEqualTo(DeadLetters.MAX_STACKTRACE);
    }

    @Test
    void addSourceReplacesEarlierValues() {
        Headers headers = new RecordHeaders();
        deadLetters.addSource(headers, DeadLetters.PRODUCER);
        deadLetters.addSource(headers, DeadLetters.CONSUMER);
        assertThat(headers.headers(DeadLetters.HEADER_SOURCE)).hasSize(1);
        assertThat(text(headers, DeadLetters.HEADER_SOURCE)).isEqualTo("consumer");
    }

    @Test
    void countsByServiceTopicSideAndRootCause() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        DeadLetterMetrics metrics = new DeadLetterMetrics(registry, "oms-exchange-simulator");
        metrics.deadLettered("commands", DeadLetters.CONSUMER, new RuntimeException(new NullPointerException()));
        metrics.deadLettered("commands", DeadLetters.CONSUMER, new NullPointerException());
        metrics.deadLetterFailed("commands");

        assertThat(registry.get(DeadLetterMetrics.DEAD_LETTERS)
                .tags("service", "oms-exchange-simulator", "topic", "commands", "side", "consumer", "exception", "NullPointerException")
                .counter().count()).isEqualTo(2.0);
        assertThat(registry.get(DeadLetterMetrics.DEAD_LETTERS_FAILED).tags("topic", "commands").counter().count()).isEqualTo(1.0);
    }

    /** The stack trace header names the failure, its frames and its causes. */
    @Test
    void stackTraceIncludesFramesAndCauses() {
        String trace = DeadLetters.stackTrace(new IllegalStateException("outer", new java.io.IOException("inner")));

        assertThat(trace).startsWith("java.lang.IllegalStateException: outer\n\tat ");
        assertThat(trace).contains("Caused by: java.io.IOException: inner\n");
        assertThat(trace).contains("DeadLettersTest.stackTraceIncludesFramesAndCauses");
    }
}
