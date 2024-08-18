package org.oms.transactions.model;

import org.apache.commons.lang3.builder.EqualsBuilder;
import org.apache.commons.lang3.builder.HashCodeBuilder;
import org.apache.commons.lang3.builder.ReflectionToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import org.springframework.data.annotation.Id;
import org.springframework.data.redis.core.RedisHash;
import org.springframework.data.redis.core.index.Indexed;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonInclude.Include;

@RedisHash
@JsonInclude(Include.NON_NULL)
public class Fill implements Serializable {

    @Id
    private String id;

    private String orderId;

    @Indexed
    private String fillId;

    private BigDecimal avgPx;

    private BigDecimal cumQty;

    private String execID;

    private String lastCapacity;

    private String lastMkt;

    private BigDecimal lastPx;

    private BigDecimal lastQty;

    private LocalDateTime transactTime;

    private String execType;

    private BigDecimal leavesQty;

    private BigDecimal dayOrderQty;

    private BigDecimal dayCumQty;

    private BigDecimal dayAvgPx;

    private String secondaryExecID;

    private LocalDateTime creationDate;

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

    public String getFillId() {
        return fillId;
    }

    public void setFillId(String fillId) {
        this.fillId = fillId;
    }

    public BigDecimal getAvgPx() {
        return avgPx;
    }

    public void setAvgPx(BigDecimal avgPx) {
        this.avgPx = avgPx;
    }

    public BigDecimal getCumQty() {
        return cumQty;
    }

    public void setCumQty(BigDecimal cumQty) {
        this.cumQty = cumQty;
    }

    public String getExecID() {
        return execID;
    }

    public void setExecID(String execID) {
        this.execID = execID;
    }

    public String getLastCapacity() {
        return lastCapacity;
    }

    public void setLastCapacity(String lastCapacity) {
        this.lastCapacity = lastCapacity;
    }

    public String getLastMkt() {
        return lastMkt;
    }

    public void setLastMkt(String lastMkt) {
        this.lastMkt = lastMkt;
    }

    public BigDecimal getLastPx() {
        return lastPx;
    }

    public void setLastPx(BigDecimal lastPx) {
        this.lastPx = lastPx;
    }

    public BigDecimal getLastQty() {
        return lastQty;
    }

    public void setLastQty(BigDecimal lastQty) {
        this.lastQty = lastQty;
    }

    public LocalDateTime getTransactTime() {
        return transactTime;
    }

    public void setTransactTime(LocalDateTime transactTime) {
        this.transactTime = transactTime;
    }

    public String getExecType() {
        return execType;
    }

    public void setExecType(String execType) {
        this.execType = execType;
    }

    public BigDecimal getLeavesQty() {
        return leavesQty;
    }

    public void setLeavesQty(BigDecimal leavesQty) {
        this.leavesQty = leavesQty;
    }

    public BigDecimal getDayOrderQty() {
        return dayOrderQty;
    }

    public void setDayOrderQty(BigDecimal dayOrderQty) {
        this.dayOrderQty = dayOrderQty;
    }

    public BigDecimal getDayCumQty() {
        return dayCumQty;
    }

    public void setDayCumQty(BigDecimal dayCumQty) {
        this.dayCumQty = dayCumQty;
    }

    public BigDecimal getDayAvgPx() {
        return dayAvgPx;
    }

    public void setDayAvgPx(BigDecimal dayAvgPx) {
        this.dayAvgPx = dayAvgPx;
    }

    public String getSecondaryExecID() {
        return secondaryExecID;
    }

    public void setSecondaryExecID(String secondaryExecID) {
        this.secondaryExecID = secondaryExecID;
    }

    public LocalDateTime getCreationDate() {
        return creationDate;
    }

    public void setCreationDate(LocalDateTime creationDate) {
        this.creationDate = creationDate;
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
