package org.example.oms.model;

import java.time.Instant;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import org.example.common.model.Execution;
import org.example.common.model.Order;
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
import lombok.Setter;
import lombok.experimental.SuperBuilder;

/**
 * A message staged for publication to Kafka inside the same transaction as the state change that
 * produced it.
 *
 * <p>Rows are written by {@link org.example.oms.service.OrderEventAppender} and drained by
 * {@link org.example.oms.service.OutboxRelay}. The relay is what makes this an outbox rather than a
 * best-effort send: a row survives broker outages and process death, and is retried until it is
 * published or a human intervenes.
 */
@Entity
@Table(name = "outbox")
@SuperBuilder
@NoArgsConstructor
@Getter
public class OutboxMessage {

    /** Which message the row becomes; selects the payload column(s) to read. */
    public enum AggregateType {
        ORDER,
        EXECUTION,
        /**
         * A fill with the order it changed; reads both payload columns (SPEC-0019). Only rows staged
         * before SPEC-0020 have this type; the projection now stages the message as PROJECTION.
         */
        ORDER_EXECUTION,
        /** A message staged by a projection: {@link #payloadType} and {@link #payload} (SPEC-0020). */
        PROJECTION
    }

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "outbox_sequence")
    @SequenceGenerator(name = "outbox_sequence", sequenceName = "outbox_seq", allocationSize = 1)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "aggregate_type", nullable = false)
    private AggregateType aggregateType;

    /**
     * The Kafka partition key: the order's root order id, or its own order id when it has none. All
     * messages of one order tree therefore land on one partition of each topic.
     */
    @Column(name = "aggregate_id", nullable = false)
    private String aggregateId;

    @Column(nullable = false)
    private String topic;

    /**
     * The event-log version this message corresponds to, published as the Avro {@code eventId}.
     *
     * <p>Carried explicitly rather than read from the order's {@code txNr}: Hibernate only increments
     * the entity version at flush, so at staging time {@code txNr} still holds the pre-update value
     * and two consecutive events would publish the same id.
     */
    @Column(name = "aggregate_version", nullable = false)
    private long aggregateVersion;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", name = "order_payload")
    private Order orderPayload;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", name = "execution_payload")
    private Execution executionPayload;

    /** The Avro record's schema full name, for PROJECTION rows. */
    @Column(name = "payload_type")
    private String payloadType;

    /** The Avro record's binary encoding, for PROJECTION rows. */
    @Column(name = "payload")
    private byte[] payload;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Setter
    @Column(nullable = false)
    private int attempts;

    @Setter
    @Column(name = "last_error", length = 2000)
    private String lastError;

    /** Records a failed publication attempt so the relay can back off and operators can triage. */
    public void recordFailure(String error) {
        this.attempts++;
        this.lastError = error == null ? null : error.substring(0, Math.min(error.length(), 2000));
    }

    @Override
    public final boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (other == null || Hibernate.getClass(this) != Hibernate.getClass(other)) {
            return false;
        }
        OutboxMessage that = (OutboxMessage) other;
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
