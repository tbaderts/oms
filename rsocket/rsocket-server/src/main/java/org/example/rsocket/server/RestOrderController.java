package org.example.rsocket.server;

import org.example.rsocket.domain.Order;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.EmitterProcessor;
import reactor.core.publisher.Flux;

@RestController
public class RestOrderController {

	private final EmitterProcessor<Order> processor;

	@Autowired
	public RestOrderController(EmitterProcessor<Order> processor) {
		this.processor = processor;
	}

	@GetMapping(value = "/orders/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	public Flux<Order> orderStream() {
		return Flux.create(sink -> processor.subscribe(sink::next));
	}

}
