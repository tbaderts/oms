package org.example.oms.service.leadership;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * Work that exactly one instance of oms-core may do at a time (SPEC-0048), each guarded by its own
 * PostgreSQL advisory lock.
 */
@Getter
@RequiredArgsConstructor
public enum Role {

    /** Draining the outbox: one drainer keeps each aggregate's records in order. */
    OUTBOX_RELAY(0x4F4D5301L),

    /** End of day and GTD expiry: one runner instead of every instance competing. */
    SCHEDULER(0x4F4D5302L);

    /** The advisory lock key. */
    private final long lockKey;
}
