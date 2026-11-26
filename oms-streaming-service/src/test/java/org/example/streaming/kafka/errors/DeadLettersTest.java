package org.example.streaming.kafka.errors;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.apache.kafka.common.header.Headers;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/** SPEC-0077: dead-letter topic names, headers and the dead-letter counter. */
class DeadLettersTest {

    /** This service's copy of Spring Kafka's header names. */
    private static final class KafkaHeaders {
        static final String DLT_EXCEPTION_FQCN = DeadLetters.KafkaHeaders.DLT_EXCEPTION_FQCN;
        static final String DLT_EXCEPTION_MESSAGE = DeadLetters.KafkaHeaders.DLT_EXCEPTION_MESSAGE;
        static final String DLT_EXCEPTION_CAUSE_FQCN = DeadLetters.KafkaHeaders.DLT_EXCEPTION_CAUSE_FQCN;
        static final String DLT_EXCEPTION_STACKTRACE = DeadLetters.KafkaHeaders.DLT_EXCEPTION_STACKTRACE;
        static final String DLT_ORIGINAL_TOPIC = DeadLetters.KafkaHeaders.DLT_ORIGINAL_TOPIC;
        static final String DLT_ORIGINAL_PARTITION = DeadLetters.KafkaHeaders.DLT_ORIGINAL_PARTITION;
        static final String DLT_ORIGINAL_OFFSET = DeadLetters.KafkaHeaders.DLT_ORIGINAL_OFFSET;
        static final String DLT_ORIGINAL_TIMESTAMP = DeadLetters.KafkaHeaders.DLT_ORIGINAL_TIMESTAMP;
    }

    private final DeadLetters deadLetters = new DeadLetters("oms-streaming-service");

    private static String text(Headers headers, String key) {
        return new String(headers.lastHeader(key).value(), StandardCharsets.UTF_8);
    }

    @Test
    void topicIsSourceServiceAndSuffix() {
        assertThat(deadLetters.topicFor("commands")).isEqualTo("commands.oms-streaming-service.DLT");
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
        assertThat(text(headers, DeadLetters.HEADER_SERVICE)).isEqualTo("oms-streaming-service");
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
        DeadLetterMetrics metrics = new DeadLetterMetrics(registry, "oms-streaming-service");
        metrics.deadLettered("commands", DeadLetters.CONSUMER, new RuntimeException(new NullPointerException()));
        metrics.deadLettered("commands", DeadLetters.CONSUMER, new NullPointerException());
        metrics.deadLetterFailed("commands");

        assertThat(registry.get(DeadLetterMetrics.DEAD_LETTERS)
                .tags("service", "oms-streaming-service", "topic", "commands", "side", "consumer", "exception", "NullPointerException")
                .counter().count()).isEqualTo(2.0);
        assertThat(registry.get(DeadLetterMetrics.DEAD_LETTERS_FAILED).tags("topic", "commands").counter().count()).isEqualTo(1.0);
    }

    @Test
    void consumerFailureHeadersUseSpringsNamesAndTheRecordsOrigin() {
        Headers headers = new RecordHeaders();
        deadLetters.addConsumerFailure(headers, "oms_orders", 2, 41L, 1_764_061_200_000L, new NullPointerException("x"));

        assertThat(text(headers, KafkaHeaders.DLT_ORIGINAL_TOPIC)).isEqualTo("oms_orders");
        assertThat(java.nio.ByteBuffer.wrap(headers.lastHeader(KafkaHeaders.DLT_ORIGINAL_PARTITION).value()).getInt()).isEqualTo(2);
        assertThat(java.nio.ByteBuffer.wrap(headers.lastHeader(KafkaHeaders.DLT_ORIGINAL_OFFSET).value()).getLong()).isEqualTo(41L);
        assertThat(java.nio.ByteBuffer.wrap(headers.lastHeader(KafkaHeaders.DLT_ORIGINAL_TIMESTAMP).value()).getLong()).isEqualTo(1_764_061_200_000L);
        assertThat(headers.headers(KafkaHeaders.DLT_ORIGINAL_TIMESTAMP)).hasSize(1);
        assertThat(text(headers, KafkaHeaders.DLT_EXCEPTION_FQCN)).isEqualTo(NullPointerException.class.getName());
        assertThat(text(headers, DeadLetters.HEADER_SOURCE)).isEqualTo("consumer");
    }

    /** The literal names are Spring Kafka's (pinned against Spring's constants in the oms-core copy). */
    @Test
    void headerNamesAreSpringKafkas() {
        assertThat(KafkaHeaders.DLT_EXCEPTION_FQCN).isEqualTo("kafka_dlt-exception-fqcn");
        assertThat(KafkaHeaders.DLT_ORIGINAL_TOPIC).isEqualTo("kafka_dlt-original-topic");
        assertThat(KafkaHeaders.DLT_ORIGINAL_PARTITION).isEqualTo("kafka_dlt-original-partition");
        assertThat(KafkaHeaders.DLT_ORIGINAL_OFFSET).isEqualTo("kafka_dlt-original-offset");
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
