package org.example.rsocket;

import java.math.BigDecimal;
import java.time.Instant;

import org.example.rsocket.domain.Order;
import org.example.rsocket.domain.OrderType;
import org.example.rsocket.domain.Side;
import org.example.rsocket.domain.Tif;
import org.json.JSONException;
import org.junit.jupiter.api.Test;
import org.skyscreamer.jsonassert.JSONAssert;
import org.skyscreamer.jsonassert.JSONCompareMode;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

public class OrderTest {

	@Test
	public void testCreateOrder() throws JsonProcessingException, JSONException {
		Order order = new Order();
		order.setSymbol("INTC");
		order.setSide(Side.BUY);
		order.setQuantity(new BigDecimal(100));
		order.setOrderType(OrderType.MARKET);
		order.setTif(Tif.DAY);
		order.setTransactionTimestamp(Instant.now());

		ObjectMapper mapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
		mapper.registerModule(new JavaTimeModule());
		mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
		String jsonString = mapper.writeValueAsString(order);
		System.out.println(jsonString);
		JSONAssert.assertEquals("{\"side\":\"BUY\",\"orderType\":\"MARKET\",\"tif\":\"DAY\",\"quantity\":100,\"symbol\":\"INTC\"}", jsonString, JSONCompareMode.LENIENT);
	}
}
