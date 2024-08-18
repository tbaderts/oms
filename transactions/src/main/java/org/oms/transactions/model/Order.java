package org.oms.transactions.model;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

import org.apache.commons.lang3.builder.EqualsBuilder;
import org.apache.commons.lang3.builder.HashCodeBuilder;
import org.apache.commons.lang3.builder.ReflectionToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import org.springframework.data.annotation.Id;
import org.springframework.data.redis.core.RedisHash;
import org.springframework.data.redis.core.index.Indexed;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonInclude.Include;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;

@RedisHash
@JsonInclude(Include.NON_NULL)
public class Order implements Serializable {

    @Id
    private String id;

    @Indexed
    private String orderId;

    @Indexed

    private String parentOrderId;

    @Indexed
    private String rootOrderId;

    private String sessionId;

    @Indexed
    private String clOrdId;

    @JsonSerialize(using = LocalDateTimeSerializer.class)
    @JsonDeserialize(using = LocalDateTimeDeserializer.class)
    private LocalDateTime sendingTime;

    private String account;

    private String origClOrdId;

    private String execInst;

    private String handlInst;

    private String securityIDSource;

    private BigDecimal orderQty;

    private BigDecimal cashOrderQty;

    private String positionEffect;

    private String securityDesc;

    private String securityType;

    private String maturityMonthYear;

    private BigDecimal strikePrice;

    private String priceType;

    private Integer putOrCall;

    private String underlyingSecurityType;

    private String ordType;

    private BigDecimal price;

    private BigDecimal stopPx;

    private String securityId;

    private String side;

    private String symbol;

    private String timeInForce;

    private LocalDateTime transactTime;

    private String exDestination;

    private String settlCurrency;

    private LocalDateTime expireTime;

    private String securityExchange;

    private String text;

    private LocalDateTime tifTimestamp;

    private State state;

    private CancelState cancelState;

    private Set<Fill> fills = new HashSet<>();
    
    private Set<Order> orders = new HashSet<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getOrderId() {
        return orderId;
    }

    public void setOrderId(String orderId) {
        this.orderId = orderId;
    }

    public String getParentOrderId() {
        return parentOrderId;
    }

    public void setParentOrderId(String parentOrderId) {
        this.parentOrderId = parentOrderId;
    }

    public String getRootOrderId() {
        return rootOrderId;
    }

    public void setRootOrderId(String rootOrderId) {
        this.rootOrderId = rootOrderId;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getClOrdId() {
        return clOrdId;
    }

    public void setClOrdId(String clOrdId) {
        this.clOrdId = clOrdId;
    }

    public LocalDateTime getSendingTime() {
        return sendingTime;
    }

    public void setSendingTime(LocalDateTime sendingTime) {
        this.sendingTime = sendingTime;
    }

    public String getAccount() {
        return account;
    }

    public void setAccount(String account) {
        this.account = account;
    }

    public String getOrigClOrdId() {
        return origClOrdId;
    }

    public void setOrigClOrdId(String origClOrdId) {
        this.origClOrdId = origClOrdId;
    }

    public String getExecInst() {
        return execInst;
    }

    public void setExecInst(String execInst) {
        this.execInst = execInst;
    }

    public String getHandlInst() {
        return handlInst;
    }

    public void setHandlInst(String handlInst) {
        this.handlInst = handlInst;
    }

    public String getSecurityIDSource() {
        return securityIDSource;
    }

    public void setSecurityIDSource(String securityIDSource) {
        this.securityIDSource = securityIDSource;
    }

    public BigDecimal getOrderQty() {
        return orderQty;
    }

    public void setOrderQty(BigDecimal orderQty) {
        this.orderQty = orderQty;
    }

    public BigDecimal getCashOrderQty() {
        return cashOrderQty;
    }

    public void setCashOrderQty(BigDecimal cashOrderQty) {
        this.cashOrderQty = cashOrderQty;
    }

    public String getPositionEffect() {
        return positionEffect;
    }

    public void setPositionEffect(String positionEffect) {
        this.positionEffect = positionEffect;
    }

    public String getSecurityDesc() {
        return securityDesc;
    }

    public void setSecurityDesc(String securityDesc) {
        this.securityDesc = securityDesc;
    }

    public String getSecurityType() {
        return securityType;
    }

    public void setSecurityType(String securityType) {
        this.securityType = securityType;
    }

    public String getMaturityMonthYear() {
        return maturityMonthYear;
    }

    public void setMaturityMonthYear(String maturityMonthYear) {
        this.maturityMonthYear = maturityMonthYear;
    }

    public BigDecimal getStrikePrice() {
        return strikePrice;
    }

    public void setStrikePrice(BigDecimal strikePrice) {
        this.strikePrice = strikePrice;
    }

    public String getPriceType() {
        return priceType;
    }

    public void setPriceType(String priceType) {
        this.priceType = priceType;
    }

    public Integer getPutOrCall() {
        return putOrCall;
    }

    public void setPutOrCall(Integer putOrCall) {
        this.putOrCall = putOrCall;
    }

    public String getUnderlyingSecurityType() {
        return underlyingSecurityType;
    }

    public void setUnderlyingSecurityType(String underlyingSecurityType) {
        this.underlyingSecurityType = underlyingSecurityType;
    }

    public String getOrdType() {
        return ordType;
    }

    public void setOrdType(String ordType) {
        this.ordType = ordType;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public BigDecimal getStopPx() {
        return stopPx;
    }

    public void setStopPx(BigDecimal stopPx) {
        this.stopPx = stopPx;
    }

    public String getSecurityId() {
        return securityId;
    }

    public void setSecurityId(String securityId) {
        this.securityId = securityId;
    }

    public String getSide() {
        return side;
    }

    public void setSide(String side) {
        this.side = side;
    }

    public String getSymbol() {
        return symbol;
    }

    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }

    public String getTimeInForce() {
        return timeInForce;
    }

    public void setTimeInForce(String timeInForce) {
        this.timeInForce = timeInForce;
    }

    public LocalDateTime getTransactTime() {
        return transactTime;
    }

    public void setTransactTime(LocalDateTime transactTime) {
        this.transactTime = transactTime;
    }

    public String getExDestination() {
        return exDestination;
    }

    public void setExDestination(String exDestination) {
        this.exDestination = exDestination;
    }

    public String getSettlCurrency() {
        return settlCurrency;
    }

    public void setSettlCurrency(String settlCurrency) {
        this.settlCurrency = settlCurrency;
    }

    public LocalDateTime getExpireTime() {
        return expireTime;
    }

    public void setExpireTime(LocalDateTime expireTime) {
        this.expireTime = expireTime;
    }

    public String getSecurityExchange() {
        return securityExchange;
    }

    public void setSecurityExchange(String securityExchange) {
        this.securityExchange = securityExchange;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public LocalDateTime getTifTimestamp() {
        return tifTimestamp;
    }

    public void setTifTimestamp(LocalDateTime tifTimestamp) {
        this.tifTimestamp = tifTimestamp;
    }

    public State getState() {
        return state;
    }

    public void setState(State state) {
        this.state = state;
    }

    public CancelState getCancelState() {
        return cancelState;
    }

    public void setCancelState(CancelState cancelState) {
        this.cancelState = cancelState;
    }

    public Set<Fill> getFills() {
        return fills;
    }

    public void setFills(Set<Fill> fills) {
        this.fills = fills;
    }

    public Set<Order> getOrders() {
        return orders;
    }

    public void setOrders(Set<Order> orders) {
        this.orders = orders;
    }

    @Override
    public int hashCode() {
        return HashCodeBuilder.reflectionHashCode(this);
    }

    @Override
    public boolean equals(Object obj) {
        return EqualsBuilder.reflectionEquals(this, obj);
    }

    @Override
    public String toString() {
        return ReflectionToStringBuilder.toString(this, ToStringStyle.SHORT_PREFIX_STYLE, true, true, true, null);
    }

}
