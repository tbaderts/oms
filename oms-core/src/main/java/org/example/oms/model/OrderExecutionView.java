package org.example.oms.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import org.hibernate.Hibernate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * One applied fill with the order as of that fill: the order-execution projection (SPEC-0020).
 *
 * <p>Written only in the fill's command transaction by
 * {@link org.example.oms.projection.OrderExecutionProjection}, or by a rebuild; read by the query
 * API. Unique on {@code (orderId, execId)}, so re-projecting a fill rewrites its row.
 */
@Entity
@Table(name = "order_execution_view")
@SuperBuilder(toBuilder = true)
@NoArgsConstructor
@Getter
@Setter
public class OrderExecutionView {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_execution_view_sequence")
    @SequenceGenerator(name = "order_execution_view_sequence", sequenceName = "order_execution_view_seq", allocationSize = 1)
    private Long id;

    @Column(name = "order_id", nullable = false)
    private String orderId;

    @Column(name = "execid", nullable = false)
    private String execId;

    private String rootOrderId;
    private String parentOrderId;
    private String leg;
    private String clOrdId;
    private String sessionId;
    private String account;
    private String side;
    private String symbol;
    private String securityId;
    private String ordType;
    private BigDecimal price;
    private BigDecimal orderQty;
    private String settlCurrency;
    private String exDestination;
    private BigDecimal lastQty;
    private BigDecimal lastPx;
    private String execType;
    private String lastCapacity;
    private String lastMkt;
    private Instant transactTime;
    private BigDecimal cumQty;
    private BigDecimal leavesQty;
    private BigDecimal avgPx;
    private String state;

    @Column(name = "order_version", nullable = false)
    private long orderVersion;

    private LocalDate tradeDate;

    @Column(name = "projected_at", nullable = false)
    private Instant projectedAt;

    @Override
    public final boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (other == null || Hibernate.getClass(this) != Hibernate.getClass(other)) {
            return false;
        }
        OrderExecutionView that = (OrderExecutionView) other;
        return id != null && id.equals(that.id);
    }

    @Override
    public final int hashCode() {
        return Hibernate.getClass(this).hashCode();
    }
}
