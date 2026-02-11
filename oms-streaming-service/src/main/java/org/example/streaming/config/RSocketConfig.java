package org.example.streaming.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.codec.json.Jackson2JsonDecoder;
import org.springframework.http.codec.json.Jackson2JsonEncoder;
import org.springframework.messaging.rsocket.RSocketStrategies;
import org.springframework.messaging.rsocket.annotation.support.RSocketMessageHandler;
import org.springframework.util.MimeTypeUtils;

import com.fasterxml.jackson.databind.ObjectMapper;

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

    @Bean
    public RSocketStrategies rSocketStrategies(ObjectMapper objectMapper) {
        return RSocketStrategies.builder()
                .encoder(new Jackson2JsonEncoder(objectMapper, MimeTypeUtils.APPLICATION_JSON))
                .decoder(new Jackson2JsonDecoder(objectMapper, MimeTypeUtils.APPLICATION_JSON))
                .build();
    }
}
