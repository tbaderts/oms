package org.example.rsocket.server;

import org.example.rsocket.domain.Order;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

import reactor.core.publisher.EmitterProcessor;
import reactor.core.publisher.Flux;

@Controller
public class RSocketOrderController {

	private final EmitterProcessor<Order> processor;

	@Autowired
	public RSocketOrderController(EmitterProcessor<Order> processor) {
		this.processor = processor;
	}

	@MessageMapping("order-stream")
	public Flux<Order> orderStream(String msg) {
		System.out.println("Received request: " + msg);
		return Flux.create(sink -> processor.subscribe(sink::next));
	}

}
