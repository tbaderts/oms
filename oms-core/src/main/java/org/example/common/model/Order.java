package org.example.common.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import org.hibernate.Hibernate;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

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
import lombok.Setter;
import lombok.experimental.SuperBuilder;
import lombok.extern.jackson.Jacksonized;

@Entity
@Table(
    name = "orders",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uq_orders_session_cl_ord_id",
            columnNames = {"session_id", "cl_ord_id"})
    })
@SuperBuilder(toBuilder = true)
@NoArgsConstructor
@Getter
@Jacksonized
@JsonIgnoreProperties(ignoreUnknown = true)
public class Order implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_sequence")
    @SequenceGenerator(name = "order_sequence", sequenceName = "order_seq", allocationSize = 1)
    private Long id;

    private String orderId;
    private String parentOrderId;
    private String rootOrderId;
    @Setter private long txNr;
    private String sessionId;
    private String clOrdId;
    private Instant sendingTime;
    private String account;
    private String origClOrdId;

    @Enumerated(EnumType.STRING)
    private ExecInst execInst;

    @Enumerated(EnumType.STRING)
    private HandlInst handlInst;

    @Enumerated(EnumType.STRING)
    private SecurityIdSource securityIdSource;

    @Enumerated(EnumType.STRING)
    private Leg leg;

    private BigDecimal orderQty;
    private BigDecimal cashOrderQty;
    private BigDecimal placeQty;    // How much of the order quantity is placed in the market
    private BigDecimal cumQty;      // Currently executed quantity for chain of orders
    private BigDecimal leavesQty;   // Quantity open for further execution
    private BigDecimal allocQty;    // Quantity allocated to client

    @Enumerated(EnumType.STRING)
    private PositionEffect positionEffect;

    private String securityDesc;

    @Enumerated(EnumType.STRING)
    private SecurityType securityType;

    private String maturityMonthYear;
    private BigDecimal strikePrice;

    @Enumerated(EnumType.STRING)
    private PriceType priceType;

    private Integer putOrCall;
    private String underlyingSecurityType;

    @Enumerated(EnumType.STRING)
    private OrdType ordType;

    private BigDecimal price;
    private BigDecimal stopPx;
    private String securityId;

    @Enumerated(EnumType.STRING)
    private Side side;

    private String symbol;

    @Enumerated(EnumType.STRING)
    private TimeInForce timeInForce;

    private Instant transactTime;
    private String exDestination;
    private String settlCurrency;
    private Instant expireTime;
    private String securityExchange;
    private String text;
    private Instant tifTimestamp;
    @Setter private State state;
    @Setter private CancelState cancelState;

    @Override
    public final boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (other == null || Hibernate.getClass(this) != Hibernate.getClass(other)) {
            return false;
        }
        Order that = (Order) other;
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
