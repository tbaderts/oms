package org.example.rsocket;

import org.example.rsocket.domain.Order;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.messaging.rsocket.RSocketRequester;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import reactor.core.publisher.Flux;

@RestController
public class RestOrderController {

	private final RSocketRequester rsocketRequester;

	@Autowired
	public RestOrderController(RSocketRequester rsocketRequester) {
		this.rsocketRequester = rsocketRequester;
	}

	@GetMapping(value = "/orders/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	public Flux<Order> getOrders() {
		return rsocketRequester.route("order-stream").data("test request").retrieveFlux(Order.class).log();
	}

}
