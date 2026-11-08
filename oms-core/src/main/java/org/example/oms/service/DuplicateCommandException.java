package org.example.oms.service;

import lombok.Getter;

/**
 * A command whose commandId the order has already applied (SPEC-0046).
 *
 * <p>It is a refusal, not a fault: the command changed nothing, and retrying it can never succeed.
 * REST answers it with 409 ({@code urn:oms:error:duplicate-command}); the Kafka listener
 * acknowledges it. Raised by the appender when the unique {@code (order_id, command_id)} catches a
 * race the dedup lookup could not see, and at the REST edge for a refusal the lookup marked as a
 * duplicate.
 */
@Getter
public class DuplicateCommandException extends RuntimeException {

    private final String orderId;
    private final String commandId;

    public DuplicateCommandException(String orderId, String commandId) {
        this(orderId, commandId, null);
    }

    public DuplicateCommandException(String orderId, String commandId, Throwable cause) {
        super("Duplicate command " + commandId + " for order " + orderId, cause);
        this.orderId = orderId;
        this.commandId = commandId;
    }
}
