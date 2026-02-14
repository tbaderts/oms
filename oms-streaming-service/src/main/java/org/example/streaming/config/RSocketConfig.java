package org.example.streaming.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.rsocket.RSocketStrategies;
import org.springframework.messaging.rsocket.annotation.support.RSocketMessageHandler;

/**
 * RSocket configuration for bidirectional streaming over WebSocket.
 * 
 * <p>Configures RSocket server to handle Trade Blotter streaming requests
 * with JSON serialization support. Uses Spring Boot's auto-configured ObjectMapper
 * to inherit spring.jackson.* settings.
 */
@Configuration
public class RSocketConfig {

    @Bean
    public RSocketMessageHandler messageHandler(RSocketStrategies strategies) {
        RSocketMessageHandler handler = new RSocketMessageHandler();
        handler.setRSocketStrategies(strategies);
        return handler;
    }
}
