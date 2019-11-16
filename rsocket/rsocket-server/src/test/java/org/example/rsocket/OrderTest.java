package org.example.rsocket;

import java.math.BigDecimal;
import java.time.Instant;

import org.example.rsocket.domain.Order;
import org.example.rsocket.domain.OrderType;
import org.example.rsocket.domain.Side;
import org.example.rsocket.domain.Tif;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

public class OrderTest {

	@Test
	public void testCreateOrder() throws JsonProcessingException {
		Order order = new Order();
		order.setSymbol("INTC");
		order.setSide(Side.BUY);
		order.setQuantity(new BigDecimal(100));
		order.setOrderType(OrderType.MARKET);
		order.setTif(Tif.DAY);
		order.setTransactionTimestamp(Instant.now());
		
		ObjectMapper mapper = new ObjectMapper();
		mapper.registerModule(new JavaTimeModule());
		mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
		System.out.println(mapper.writeValueAsString(order));
	}
}
