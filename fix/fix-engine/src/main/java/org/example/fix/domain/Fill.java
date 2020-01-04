package org.example.fix.domain;

import java.math.BigDecimal;
import java.time.Instant;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class Fill {
	private Integer id;
	private Side side;
	private String execID;
	private String symbol;
	private BigDecimal quantity;
	private BigDecimal cumQty;
	@JsonFormat(shape = JsonFormat.Shape.STRING)
	private Instant transactionTimestamp;

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

	public String getExecID() {
		return execID;
	}

	public void setExecID(String execID) {
		this.execID = execID;
	}

	public String getSymbol() {
		return symbol;
	}

	public void setSymbol(String symbol) {
		this.symbol = symbol;
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

	public Instant getTransactionTimestamp() {
		return transactionTimestamp;
	}

	public void setTransactionTimestamp(Instant transactionTimestamp) {
		this.transactionTimestamp = transactionTimestamp;
	}

	public String toString() {
		return ReflectionToStringBuilder.toString(this);
	}
}
