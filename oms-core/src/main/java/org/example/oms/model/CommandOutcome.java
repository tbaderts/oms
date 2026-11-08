package org.example.oms.model;

/** What became of a command (SPEC-0046). Persisted by name in {@code command_log.outcome}. */
public enum CommandOutcome {
    /** It changed the order; its event is in {@code order_events}. */
    APPLIED,
    /** It was refused (invalid, not allowed in the order's state, or a duplicate) and changed nothing. */
    REFUSED,
    /** It failed with an error and changed nothing; on Kafka it may be retried. */
    FAILED
}
