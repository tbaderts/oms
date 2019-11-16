package org.example.rsocket;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.rsocket.RSocketRequester;
import org.springframework.web.reactive.config.EnableWebFlux;

@Configuration
@EnableWebFlux
public class RSocketClientConfig {

	@Bean
	RSocketRequester rsocketRequester(RSocketRequester.Builder rsocketRequesterBuilder) {
		return rsocketRequesterBuilder.connectTcp("localhost", 7000).block();
	}

}
