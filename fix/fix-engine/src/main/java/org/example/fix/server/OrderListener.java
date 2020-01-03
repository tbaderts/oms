package org.example.fix.server;

import java.util.Optional;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.fix.domain.Order;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class OrderListener {

	private static final Logger LOGGER = LoggerFactory.getLogger(OrderListener.class);
	private final ObjectMapper objectMapper;
	private final MessageRouter messageRouter;

	@Autowired
	public OrderListener(ObjectMapper objectMapper, MessageRouter messageRouter) {
		this.objectMapper = objectMapper;
		this.messageRouter = messageRouter;
	}

	@KafkaListener(topics = "orders")
	public void listen(ConsumerRecord<String, String> record) throws JsonProcessingException {
		LOGGER.info("Received message: {}", record);
		Optional<String> value = Optional.ofNullable(record.value());
		if (value.isPresent()) {
			Order order = objectMapper.readValue(value.get(), Order.class);
			LOGGER.info("Route order: {}", order);
			messageRouter.route(order);
		}
	}
}
