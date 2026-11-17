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
 * constraint on {@code (order_id, version)}, held on {@code order_event_keys} since the table is
 * partitioned (SPEC-0052). That constraint is what gives the log its ordering guarantee and its
 * concurrency check: two writers racing to append the same version cannot both win, and a gap in
 * the sequence is detectable.
 */
@Entity
// SPEC-0052: order_events is partitioned by month on time_stamp. Its uniqueness on (order_id,
// version) and (order_id, command_id) is enforced on order_event_keys, written by a trigger in the
// same statement, under the constraint names OrderEventAppender maps (changelog 017).
@Table(name = "order_events")
@SuperBuilder
@NoArgsConstructor
@Getter
public class OrderEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_event_sequence")
    @SequenceGenerator(
            name = "order_event_sequence",
            sequenceName = "order_event_seq",
            allocationSize = 50)
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

    /**
     * The command's commandId, when it has one. Unique per order: it is what lifecycle
     * deduplication looks up, instead of reading every stored command.
     */
    @Column(name = "command_id")
    private String commandId;

    /**
     * The execution this event is about, when it is about one: its fill, bust, correction or whack
     * (SPEC-0044). Indexed with {@code order_id}, so an execution's history is one lookup.
     */
    @Column(name = "exec_id")
    private String execId;

    /** The state the order was left in by this event. */
    @Enumerated(EnumType.STRING)
    @Column(name = "resulting_state")
    private State resultingState;

    /** The order as it stood immediately after this event. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", name = "order_snapshot")
    private Order orderSnapshot;

    /**
     * The schema version of this event's command and snapshot JSON, stamped by the appender
     * (SPEC-0024). null on rows written before the column existed: the upcasting rule in
     * oms-knowledge-base/architecture/concepts/state-store.md treats those as version 1.
     */
    @Column(name = "schema_version")
    private Integer schemaVersion;

    /** The causing command's correlationId, when it had one (SPEC-0049). */
    @Column(name = "correlation_id")
    private String correlationId;

    /** The causing command's causationId, when it had one (SPEC-0049). */
    @Column(name = "causation_id")
    private String causationId;

    /**
     * Who sent the causing command: the Kafka producer or the scheduler job; null on REST until
     * authentication exists, and on events written before SPEC-0049.
     */
    private String principal;

    /** Where the causing command entered the OMS (SPEC-0049); null on older events. */
    @Enumerated(EnumType.STRING)
    private CommandSource source;

    /**
     * The fields this event changed, as JSON {@code {"<field>": {"from": old, "to": new}}}, between
     * the order as the command loaded it and as it saved it (SPEC-0049). A first event lists every
     * field set at creation with {@code from} null. Null on older events.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", name = "changes")
    private String changes;

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
