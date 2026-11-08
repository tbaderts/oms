package org.example.common.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
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

@Entity
@Table(name = "executions")
@SuperBuilder(toBuilder = true)
@NoArgsConstructor
@Getter
public class Execution implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "execution_sequence")
    @SequenceGenerator(
            name = "execution_sequence",
            sequenceName = "execution_seq",
            allocationSize = 1)
    private Long id;

    private String orderId;
    private BigDecimal avgPx;
    private BigDecimal cumQty;

    /**
     * The venue's execution id, unique per order. Named {@code execId} as in the command, Avro and
     * query contracts; the column keeps its original name (SPEC-0041).
     */
    @Column(name = "execid")
    private String execId;
    private String lastCapacity;
    private String lastMkt;
    private BigDecimal lastPx;
    private BigDecimal lastQty;
    private Instant transactTime;
    private String execType;
    private BigDecimal leavesQty;
    private BigDecimal dayOrderQty;
    private BigDecimal dayCumQty;
    private BigDecimal dayAvgPx;
    private String secondaryExecID;
    private Instant creationDate;

    /** Whether the fill still counts (SPEC-0044). Only APPLIED executions count towards avgPx. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @lombok.Builder.Default
    private ExecutionStatus status = ExecutionStatus.APPLIED;

    /** The order event version that applied this execution (SPEC-0044). */
    private Long orderVersion;

    /** The Kafka key of the order tree, so a message about the execution needs no join (SPEC-0044). */
    private String rootOrderId;

    /** FIX ExecRefID (19): the execution a correcting execution replaces (SPEC-0044, set by SPEC-0030). */
    private String execRefId;

    /**
     * The order event version from which this execution no longer counts: its bust, whack or
     * correction (SPEC-0044). Null while it is APPLIED.
     */
    private Long bustedAtVersion;

    /** Links the execution to the event that applied it; called when the fill is recorded. */
    public void recordApplied(long orderVersion, String rootOrderId) {
        this.status = ExecutionStatus.APPLIED;
        this.orderVersion = orderVersion;
        this.rootOrderId = rootOrderId;
    }

    /**
     * Records a bust, whack or correction at the given order event version. The first such version
     * is kept, so a later bust of a corrected execution does not move the point it stopped counting.
     */
    public void recordReversal(ExecutionStatus status, long version) {
        this.status = status;
        if (this.bustedAtVersion == null) {
            this.bustedAtVersion = version;
        }
    }

    @Override
    public final boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (other == null || Hibernate.getClass(this) != Hibernate.getClass(other)) {
            return false;
        }
        Execution that = (Execution) other;
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
