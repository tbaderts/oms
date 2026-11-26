package org.example.simulator.kafka.errors;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

import org.apache.kafka.common.header.Headers;
import org.springframework.kafka.support.KafkaHeaders;

/**
 * Where this service's dead letters go and what they carry (SPEC-0077).
 *
 * <p>Every client dead-letters to {@code <source topic>.<service>.DLT}: the service in the name keeps
 * the dead letters of two consumers of one topic apart, and the {@code .DLT} suffix is what the
 * dead-letter screen lists (SPEC-0075). Records carry Spring Kafka's {@code kafka_dlt-*} headers
 * (for producer failures too, so the screen shows every dead letter alike) plus {@code dlt-source}
 * ({@code consumer} or {@code producer}) and {@code dlt-service}.
 */
public final class DeadLetters {

    public static final String SUFFIX = ".DLT";
    public static final String HEADER_SOURCE = "dlt-source";
    public static final String HEADER_SERVICE = "dlt-service";
    public static final String CONSUMER = "consumer";
    public static final String PRODUCER = "producer";
    /** Stack traces in headers are cut to this many characters. */
    static final int MAX_STACKTRACE = 8 * 1024;

    private final String serviceName;

    public DeadLetters(ErrorPolicyProperties properties) {
        this(properties.serviceName());
    }

    public DeadLetters(String serviceName) {
        this.serviceName = serviceName;
    }

    public String serviceName() {
        return serviceName;
    }

    /** {@code commands} → {@code commands.oms-core.DLT}. */
    public String topicFor(String sourceTopic) {
        return sourceTopic + "." + serviceName + SUFFIX;
    }

    /** Adds {@code dlt-source} and {@code dlt-service}; Spring's recoverer adds the rest for consumers. */
    public void addSource(Headers headers, String side) {
        headers.remove(HEADER_SOURCE);
        headers.remove(HEADER_SERVICE);
        headers.add(HEADER_SOURCE, bytes(side));
        headers.add(HEADER_SERVICE, bytes(serviceName));
    }

    /**
     * The failure headers for a dead letter written by hand (a producer failure): exception class,
     * message, root cause class, a bounded stack trace and the source topic, as Spring's recoverer
     * writes them for consumers.
     */
    public void addFailure(Headers headers, String sourceTopic, Throwable failure, String side) {
        headers.add(KafkaHeaders.DLT_EXCEPTION_FQCN, bytes(failure.getClass().getName()));
        if (failure.getMessage() != null) {
            headers.add(KafkaHeaders.DLT_EXCEPTION_MESSAGE, bytes(failure.getMessage()));
        }
        Throwable root = ErrorClassifier.rootCause(failure);
        if (root != failure) {
            headers.add(KafkaHeaders.DLT_EXCEPTION_CAUSE_FQCN, bytes(root.getClass().getName()));
        }
        headers.add(KafkaHeaders.DLT_EXCEPTION_STACKTRACE, bytes(stackTrace(failure)));
        headers.add(KafkaHeaders.DLT_ORIGINAL_TOPIC, bytes(sourceTopic));
        headers.add(KafkaHeaders.DLT_ORIGINAL_TIMESTAMP, ByteBuffer.allocate(8).putLong(System.currentTimeMillis()).array());
        addSource(headers, side);
    }

    /** Frames shown per throwable, so that the causes fit in {@link #MAX_STACKTRACE}. */
    static final int MAX_FRAMES = 20;

    /**
     * The failure's stack trace as text: each throwable with its first {@link #MAX_FRAMES} frames, then
     * its causes, bounded to {@link #MAX_STACKTRACE}.
     */
    static String stackTrace(Throwable failure) {
        StringBuilder text = new StringBuilder();
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable t = failure; t != null && seen.add(t) && text.length() < MAX_STACKTRACE; t = t.getCause()) {
            if (t != failure) {
                text.append("Caused by: ");
            }
            text.append(t).append('\n');
            StackTraceElement[] frames = t.getStackTrace();
            int shown = Math.min(frames.length, MAX_FRAMES);
            for (int i = 0; i < shown; i++) {
                text.append("\tat ").append(frames[i]).append('\n');
            }
            if (frames.length > shown) {
                text.append("\t... ").append(frames.length - shown).append(" more\n");
            }
        }
        return text.length() <= MAX_STACKTRACE ? text.toString() : text.substring(0, MAX_STACKTRACE);
    }

    private static byte[] bytes(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }
}
