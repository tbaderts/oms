package org.example.oms.config;

/**
 * A record on the commands topic that is not a command this service can read: not Avro, an unknown
 * schema id, or a record type whose class is not on the classpath (SPEC-0025).
 *
 * <p>An {@link IllegalArgumentException}, so the command error handler does not retry it: the bytes
 * will never decode on a second attempt. They go to the dead-letter topic unchanged.
 */
public class UndecodableCommandException extends IllegalArgumentException {

    public UndecodableCommandException(String message, Throwable cause) {
        super(message, cause);
    }
}
