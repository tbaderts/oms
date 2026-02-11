package org.example.streaming;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * OMS Streaming Service Application.
 * 
 * <p>This service provides real-time streaming of order and execution events
 * to the Trade Blotter UI via RSocket over WebSocket. It consumes events
 * from Kafka topics and streams them to connected clients with filtering support.
 * 
 * <p>Architecture:
 * <ul>
 *   <li>Kafka Consumer: Listens to order-events and execution-events topics
 *   <li>RSocket Server: Provides bidirectional streaming to UI clients
 *   <li>Filter Engine: Applies user-defined filters to event streams
 * </ul>
 * 
 * @see org.example.streaming.controller.TradeBlotterController
 * @see org.example.streaming.service.EventStreamProvider
 */
@SpringBootApplication
public class StreamingServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(StreamingServiceApplication.class, args);
    }
}
