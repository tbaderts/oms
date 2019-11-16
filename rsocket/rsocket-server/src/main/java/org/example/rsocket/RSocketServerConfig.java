package org.example.rsocket;

import org.example.rsocket.domain.Order;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.reactive.config.EnableWebFlux;

import reactor.core.publisher.EmitterProcessor;

@Configuration
@EnableScheduling
@EnableWebFlux
public class RSocketServerConfig {

	@Bean
	EmitterProcessor<Order> processor() {
		return EmitterProcessor.create();
	}

}
