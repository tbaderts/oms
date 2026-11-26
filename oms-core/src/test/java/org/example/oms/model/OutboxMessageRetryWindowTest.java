package org.example.oms.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

/** SPEC-0077: how an outbox row tracks its retry window. */
class OutboxMessageRetryWindowTest {

    private static final Instant T0 = Instant.parse("2026-11-26T08:00:00Z");

    @Test
    void theWindowStartsAtTheFirstRetryableFailureAndBacksOff() {
        OutboxMessage row = new OutboxMessage();

        row.recordRetryableFailure("boom", T0, Duration.ofSeconds(1));
        row.recordRetryableFailure("boom", T0.plusSeconds(1), Duration.ofSeconds(2));

        assertThat(row.getFirstFailedAt()).isEqualTo(T0);
        assertThat(row.getNextAttemptAt()).isEqualTo(T0.plusSeconds(3));
        assertThat(row.getAttempts()).isEqualTo(2);
    }

    /** An outage is not the message's fault: after it, a new failure gets a fresh window. */
    @Test
    void aTransientFailureEndsTheRunOfFailures() {
        OutboxMessage row = new OutboxMessage();
        row.recordRetryableFailure("boom", T0, Duration.ofSeconds(1));

        row.recordTransientFailure("broker unreachable");

        assertThat(row.getFirstFailedAt()).isNull();
        assertThat(row.getNextAttemptAt()).isNull();
        assertThat(row.getAttempts()).as("an outage costs no attempt").isEqualTo(1);
        assertThat(row.getLastError()).isEqualTo("broker unreachable");

        Instant later = T0.plus(Duration.ofHours(3));
        row.recordRetryableFailure("boom", later, Duration.ofSeconds(1));
        assertThat(row.getFirstFailedAt()).isEqualTo(later);
    }
}
