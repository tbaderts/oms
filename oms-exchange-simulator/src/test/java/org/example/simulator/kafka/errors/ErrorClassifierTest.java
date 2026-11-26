package org.example.simulator.kafka.errors;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.ConnectException;
import java.sql.SQLException;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeoutException;

import org.apache.avro.AvroRuntimeException;
import org.apache.kafka.common.errors.NotEnoughReplicasException;
import org.apache.kafka.common.errors.RecordTooLargeException;
import org.apache.kafka.common.errors.SerializationException;
import org.apache.kafka.common.errors.TopicAuthorizationException;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.listener.ListenerExecutionFailedException;
import org.springframework.kafka.support.serializer.DeserializationException;

/**
 * SPEC-0077 AC-3: the table of what is and is not retried. The same table is pinned in the copies of
 * this class in oms-exchange-simulator and oms-streaming-service.
 */
class ErrorClassifierTest {

    @Test
    void classifiesTable() {
        // Not retryable: bad data, programming errors, permission errors.
        assertThat(ErrorClassifier.isRetryable(new NullPointerException("x"))).isFalse();
        assertThat(ErrorClassifier.isRetryable(new ClassCastException())).isFalse();
        assertThat(ErrorClassifier.isRetryable(new IllegalArgumentException())).isFalse();
        assertThat(ErrorClassifier.isRetryable(new NumberFormatException())).isFalse();
        assertThat(ErrorClassifier.isRetryable(new ArrayIndexOutOfBoundsException())).isFalse();
        assertThat(ErrorClassifier.isRetryable(new UnsupportedOperationException())).isFalse();
        assertThat(ErrorClassifier.isRetryable(new SecurityException())).isFalse();
        assertThat(ErrorClassifier.isRetryable(new java.nio.file.AccessDeniedException("/x"))).isFalse();
        assertThat(ErrorClassifier.isRetryable(new TopicAuthorizationException("denied"))).isFalse();
        assertThat(ErrorClassifier.isRetryable(new SQLException("permission denied for table orders", "42501"))).isFalse();
        assertThat(ErrorClassifier.isRetryable(new SerializationException("bad"))).isFalse();
        assertThat(ErrorClassifier.isRetryable(new RecordTooLargeException("big"))).isFalse();
        assertThat(ErrorClassifier.isRetryable(new DeserializationException("bad", new byte[0], false, null))).isFalse();
        assertThat(ErrorClassifier.isRetryable(new AvroRuntimeException("bad schema"))).isFalse();

        // Retryable: everything transient, and IllegalStateException.
        assertThat(ErrorClassifier.isRetryable(new IllegalStateException("database unavailable"))).isTrue();
        assertThat(ErrorClassifier.isRetryable(new IOException())).isTrue();
        assertThat(ErrorClassifier.isRetryable(new ConnectException())).isTrue();
        assertThat(ErrorClassifier.isRetryable(new TimeoutException())).isTrue();
        assertThat(ErrorClassifier.isRetryable(new NotEnoughReplicasException("x"))).isTrue();
        assertThat(ErrorClassifier.isRetryable(new SQLException("connection refused", "08001"))).isTrue();
        assertThat(ErrorClassifier.isRetryable(new AvroRuntimeException("registry", new IOException()))).isTrue();
        // The schema registry unreachable while (de)serializing: I/O below, so retryable.
        assertThat(ErrorClassifier.isRetryable(new SerializationException("Error retrieving Avro schema", new java.net.SocketTimeoutException()))).isTrue();
        assertThat(ErrorClassifier.isRetryable(new DeserializationException("registry", new byte[0], false, new ConnectException()))).isTrue();
        assertThat(ErrorClassifier.isRetryable(new SerializationException("bad", new java.nio.file.AccessDeniedException("/x")))).isFalse();
        assertThat(ErrorClassifier.isRetryable(new RuntimeException("unknown"))).isTrue();
    }

    @Test
    void looksThroughWrappers() {
        Exception wrapped = new ListenerExecutionFailedException("listener failed",
                new RuntimeException("dispatch", new NullPointerException("order")));
        assertThat(ErrorClassifier.isRetryable(wrapped)).isFalse();
        assertThat(ErrorClassifier.notRetryableCause(wrapped)).isInstanceOf(NullPointerException.class);
        assertThat(ErrorClassifier.isRetryable(new CompletionException(new SQLException("denied", "42501")))).isFalse();
        assertThat(ErrorClassifier.rootCause(wrapped)).isInstanceOf(NullPointerException.class);
    }

    @Test
    void aSelfCausedExceptionEnds() {
        RuntimeException loop = new RuntimeException("loop") {
            @Override
            public synchronized Throwable getCause() {
                return this;
            }
        };
        assertThat(ErrorClassifier.isRetryable(loop)).isTrue();
        assertThat(ErrorClassifier.rootCause(loop)).isSameAs(loop);
    }
}
