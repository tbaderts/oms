package org.example.fix.domain;

import java.math.BigDecimal;
import java.time.Instant;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Order {
	private Integer id;
	private Side side;
	private OrderType orderType;
	private Tif tif;
	private BigDecimal quantity;
	private BigDecimal cumQty;
	private State state;
	private String symbol;
	private String currency;
	@JsonFormat(shape = JsonFormat.Shape.STRING)
	private Instant transactionTimestamp;
	private String destinationUser;

	public Integer getId() {
		return id;
	}

	public void setId(Integer id) {
		this.id = id;
	}

	public Side getSide() {
		return side;
	}

	public void setSide(Side side) {
		this.side = side;
	}

	public OrderType getOrderType() {
		return orderType;
	}

	public void setOrderType(OrderType orderType) {
		this.orderType = orderType;
	}

	public Tif getTif() {
		return tif;
	}

	public void setTif(Tif tif) {
		this.tif = tif;
	}

	public BigDecimal getQuantity() {
		return quantity;
	}

	public void setQuantity(BigDecimal quantity) {
		this.quantity = quantity;
	}

	public BigDecimal getCumQty() {
		return cumQty;
	}

	public void setCumQty(BigDecimal cumQty) {
		this.cumQty = cumQty;
	}

	public State getState() {
		return state;
	}

	public void setState(State state) {
		this.state = state;
	}

	public String getSymbol() {
		return symbol;
	}

	public void setSymbol(String symbol) {
		this.symbol = symbol;
	}
	
	public String getCurrency() {
		return currency;
	}

	public void setCurrency(String currency) {
		this.currency = currency;
	}

	public Instant getTransactionTimestamp() {
		return transactionTimestamp;
	}

	public void setTransactionTimestamp(Instant transactionTimestamp) {
		this.transactionTimestamp = transactionTimestamp;
	}
	
	public String getDestinationUser() {
		return destinationUser;
	}

	public void setDestinationUser(String destinationUser) {
		this.destinationUser = destinationUser;
	}

	public String toString() {
		return ReflectionToStringBuilder.toString(this);
	}
}
