package org.example.streaming.kafka.errors;

import java.io.IOException;
import java.sql.SQLException;
import java.util.List;
import java.util.Set;

/**
 * Decides whether a Kafka client failure can succeed on a retry (SPEC-0077). The same table is used
 * by every service; keep the copies in oms-core and oms-exchange-simulator in step
 * ({@code ErrorClassifierTest} pins it).
 *
 * <p>Not retryable, when anywhere in the cause chain:
 * <ul>
 *   <li>data that cannot be read or written: deserialization and serialization errors, a record too
 *       large or for an invalid topic, a message conversion error, an Avro error not caused by I/O;
 *   <li>programming errors: {@code NullPointerException}, {@code ClassCastException},
 *       {@code IllegalArgumentException}, index errors, {@code UnsupportedOperationException};
 *   <li>permission errors: Kafka authorization errors, {@code SecurityException}, a denied file,
 *       a database "insufficient privilege" (SQLState 42501), an access-denied exception of a
 *       security framework.
 * </ul>
 * Everything else is retryable: timeouts, I/O, an unavailable broker or database, and
 * {@code IllegalStateException} (too broad to mean a bug: transaction and JDBC failures use it).
 */
public final class ErrorClassifier {

    /** Class names, so no dependency is needed for the ones a service may not have on its classpath. */
    private static final Set<String> NOT_RETRYABLE_NAMES = Set.of(
            "org.springframework.kafka.support.serializer.DeserializationException",
            "org.apache.kafka.common.errors.SerializationException",
            "org.apache.kafka.common.errors.RecordTooLargeException",
            "org.apache.kafka.common.errors.InvalidTopicException",
            "org.apache.kafka.common.errors.AuthorizationException",
            "org.springframework.messaging.converter.MessageConversionException",
            "org.springframework.kafka.support.converter.ConversionException",
            "org.springframework.security.access.AccessDeniedException",
            "org.springframework.security.authorization.AuthorizationDeniedException");

    private static final List<Class<? extends Throwable>> NOT_RETRYABLE_TYPES = List.of(
            NullPointerException.class,
            ClassCastException.class,
            IllegalArgumentException.class,
            IndexOutOfBoundsException.class,
            UnsupportedOperationException.class,
            SecurityException.class,
            java.nio.file.AccessDeniedException.class);

    private static final String INSUFFICIENT_PRIVILEGE = "42501";
    private static final String AVRO_RUNTIME = "org.apache.avro.AvroRuntimeException";

    private ErrorClassifier() {}

    /** Whether {@code failure} may succeed on a retry. */
    public static boolean isRetryable(Throwable failure) {
        return notRetryableCause(failure) == null;
    }

    /** The cause that makes {@code failure} not retryable, or null when it is retryable. */
    public static Throwable notRetryableCause(Throwable failure) {
        int depth = 0;
        for (Throwable cause = failure; cause != null && depth < 32; cause = next(cause), depth++) {
            if (isNotRetryable(cause)) {
                return cause;
            }
        }
        return null;
    }

    private static boolean isNotRetryable(Throwable t) {
        for (Class<? extends Throwable> type : NOT_RETRYABLE_TYPES) {
            if (type.isInstance(t)) {
                return true;
            }
        }
        for (Class<?> c = t.getClass(); c != null && c != Throwable.class; c = c.getSuperclass()) {
            // A (de)serialization or Avro error caused by I/O is the schema registry being unreachable,
            // not bad data: retryable.
            if ((NOT_RETRYABLE_NAMES.contains(c.getName()) || AVRO_RUNTIME.equals(c.getName())) && !causedByIo(t)) {
                return true;
            }
        }
        for (Throwable s = t; s instanceof SQLException sql; s = sql.getNextException()) {
            if (INSUFFICIENT_PRIVILEGE.equals(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }

    /** Whether an I/O error (other than a denied file) is below {@code t} in its cause chain. */
    private static boolean causedByIo(Throwable t) {
        int depth = 0;
        for (Throwable c = next(t); c != null && depth < 32; c = next(c), depth++) {
            if (c instanceof IOException && !(c instanceof java.nio.file.AccessDeniedException)) {
                return true;
            }
        }
        return false;
    }

    private static Throwable next(Throwable t) {
        Throwable cause = t.getCause();
        return cause == t ? null : cause;
    }

    /** The innermost cause, for metrics and logs. */
    public static Throwable rootCause(Throwable failure) {
        Throwable root = failure;
        int depth = 0;
        for (Throwable c = next(failure); c != null && depth < 32; c = next(c), depth++) {
            root = c;
        }
        return root;
    }
}
