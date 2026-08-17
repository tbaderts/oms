package org.example.oms.model;

import java.time.Instant;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.Command;
import org.hibernate.Hibernate;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * One entry in an order's event log.
 *
 * <p>Each entry records the command that caused the change, the state the order was left in, and a
 * snapshot of the order as it stood immediately afterwards. The snapshot is what makes the log
 * replayable: {@code OrderReplayService} reconstructs an order at any point by reading the entry
 * with the highest version at or below the target, without needing to fold a chain of deltas.
 *
 * <p>{@code version} is a monotonic per-order sequence starting at 1, protected by a unique
 * constraint on {@code (order_id, version)}. That constraint is what gives the log its ordering
 * guarantee and its concurrency check: two writers racing to append the same version cannot both
 * win, and a gap in the sequence is detectable.
 */
@Entity
@Table(
        name = "order_events",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uq_order_events_order_id_version",
                    columnNames = {"order_id", "version"})
        })
@SuperBuilder
@NoArgsConstructor
@Getter
public class OrderEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_event_sequence")
    @SequenceGenerator(
            name = "order_event_sequence",
            sequenceName = "order_event_seq",
            allocationSize = 1)
    private Long id;

    private String orderId;

    /** Monotonic per-order sequence, starting at 1. */
    @Column(nullable = false)
    private long version;

    @Enumerated(EnumType.STRING)
    private Event event;

    /** The command that caused this change. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Command transaction;

    /** The state the order was left in by this event. */
    @Enumerated(EnumType.STRING)
    @Column(name = "resulting_state")
    private State resultingState;

    /** The order as it stood immediately after this event. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", name = "order_snapshot")
    private Order orderSnapshot;

    private Instant timeStamp;

    @Override
    public final boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (other == null || Hibernate.getClass(this) != Hibernate.getClass(other)) {
            return false;
        }
        OrderEvent that = (OrderEvent) other;
        return id != null && id.equals(that.id);
    }

    @Override
    public final int hashCode() {
        return Hibernate.getClass(this).hashCode();
    }

    @Override
    public String toString() {
        return ReflectionToStringBuilder.toString(this, ToStringStyle.JSON_STYLE);
    }
}
