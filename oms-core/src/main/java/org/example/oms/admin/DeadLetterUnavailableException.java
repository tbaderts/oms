package org.example.oms.admin;

/**
 * Dead letters cannot be read now: Kafka is unreachable, too slow, or disabled (SPEC-0075). The
 * operator API answers 503 with the message.
 */
public class DeadLetterUnavailableException extends RuntimeException {

    public DeadLetterUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }

    public DeadLetterUnavailableException(String message) {
        super(message);
    }
}
