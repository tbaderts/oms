package org.example.rsocket.server;

import static net.logstash.logback.argument.StructuredArguments.kv;

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

import reactor.core.publisher.EmitterProcessor;

@Component
public class OrderPublisher {

	private static final Logger LOGGER = LoggerFactory.getLogger(OrderPublisher.class);
	private final EmitterProcessor<Order> processor;
	private AtomicInteger count = new AtomicInteger();

	@Autowired
	public OrderPublisher(EmitterProcessor<Order> processor) {
		this.processor = processor;
	}

	@Scheduled(fixedRate = 5000)
	public void createOrder() {
		Order order = new Order();
		order.setId(count.getAndIncrement());
		order.setState(State.LIVE);
		order.setSymbol("INTC");
		order.setSide(Side.BUY);
		order.setQuantity(new BigDecimal(100));
		order.setOrderType(OrderType.MARKET);
		order.setTif(Tif.DAY);
		order.setTransactionTimestamp(Instant.now());	
		if (LOGGER.isDebugEnabled()) {
			LOGGER.info("Publishing message", kv("orderId", order.getId()), kv("order", order));
		}
		processor.onNext(order);
	}

}
