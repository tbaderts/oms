package org.example.streaming.controller;

import java.time.Duration;

import org.example.streaming.model.OrderDto;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.service.EventStreamProvider;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;

/**
 * REST controller for testing the streaming service.
 * Provides SSE (Server-Sent Events) endpoints for browser testing.
 */
@RestController
@RequestMapping("/api/test")
@Slf4j
@RequiredArgsConstructor
public class TestStreamController {

    private final EventStreamProvider eventStreamProvider;

    /**
     * Stream order events via Server-Sent Events (SSE).
     * Open in browser: http://localhost:8092/api/test/orders/stream
     */
    @GetMapping(value = "/orders/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<OrderEvent> streamOrdersSSE() {
        log.info("SSE client connected to order stream");
        return eventStreamProvider.getOrderEventStream(true)
                .doOnSubscribe(sub -> log.info("SSE order stream started"))
                .doOnCancel(() -> log.info("SSE order stream cancelled"))
                .doOnError(error -> log.error("Error in SSE order stream", error));
    }

    /**
     * Get current order snapshot.
     * GET http://localhost:8092/api/test/orders/snapshot
     */
    @GetMapping("/orders/snapshot")
    public Flux<OrderDto> getOrderSnapshot() {
        log.info("Order snapshot requested");
        return eventStreamProvider.getCurrentOrders();
    }

    /**
     * Health check for streaming service.
     * GET http://localhost:8092/api/test/health
     */
    @GetMapping("/health")
    public String health() {
        return "Streaming service is running!";
    }

    /**
     * Simple ping endpoint that streams a message every second.
     * GET http://localhost:8092/api/test/ping
     */
    @GetMapping(value = "/ping", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> ping() {
        return Flux.interval(Duration.ofSeconds(1))
                .map(i -> "ping " + i)
                .doOnSubscribe(sub -> log.info("Ping stream started"));
    }
}
