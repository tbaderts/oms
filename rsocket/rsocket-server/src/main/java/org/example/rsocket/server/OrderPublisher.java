package org.example.rsocket.server;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;

import org.example.rsocket.domain.Order;
import org.example.rsocket.domain.OrderType;
import org.example.rsocket.domain.Side;
import org.example.rsocket.domain.State;
import org.example.rsocket.domain.Tif;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import reactor.core.publisher.EmitterProcessor;

@Component
public class OrderPublisher {

	private static final Logger LOGGER = LoggerFactory.getLogger(OrderPublisher.class);
	private final EmitterProcessor<Order> processor;
	private final ObjectMapper objectMapper;
	private AtomicInteger count = new AtomicInteger();

	@Autowired
	public OrderPublisher(EmitterProcessor<Order> processor, ObjectMapper objectMapper) {
		this.processor = processor;
		this.objectMapper = objectMapper;
	}

	@Scheduled(fixedRate = 5000)
	public void createOrder() throws JsonProcessingException {
		Order order = new Order();
		order.setId(count.getAndIncrement());
		order.setState(State.LIVE);
		order.setSymbol("INTC");
		order.setSide(Side.BUY);
		order.setQuantity(new BigDecimal(100));
		order.setOrderType(OrderType.MARKET);
		order.setTif(Tif.DAY);
		order.setTransactionTimestamp(Instant.now());
		LOGGER.debug(objectMapper.writeValueAsString(order));
		processor.onNext(order);
	}

}
