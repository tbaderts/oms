package org.example.oms.model;

import java.time.Instant;

import org.hibernate.Hibernate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * One command the OMS received and what became of it (SPEC-0046).
 *
 * <p>{@code order_events} records what a command changed; this records the ask, including the
 * commands that were refused or failed and so changed nothing. One row per attempt.
 */
@Entity
@Table(name = "command_log")
@SuperBuilder
@NoArgsConstructor
@Getter
public class CommandLogEntry {

    /** Width of {@code command_log.reason}. */
    public static final int MAX_REASON_LENGTH = 1000;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "command_log_sequence")
    @SequenceGenerator(name = "command_log_sequence", sequenceName = "command_log_seq", allocationSize = 1)
    private Long id;

    @Column(name = "command_id")
    private String commandId;

    @Column(nullable = false)
    private String type;

    @Column(name = "order_id")
    private String orderId;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CommandSource source;

    private String principal;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CommandOutcome outcome;

    private String reason;

    @Column(name = "event_version")
    private Long eventVersion;

    @Column(name = "logged_at", nullable = false)
    private Instant loggedAt;

    @Override
    public final boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (other == null || Hibernate.getClass(this) != Hibernate.getClass(other)) {
            return false;
        }
        CommandLogEntry that = (CommandLogEntry) other;
        return id != null && id.equals(that.id);
    }

    @Override
    public final int hashCode() {
        return Hibernate.getClass(this).hashCode();
    }
}
