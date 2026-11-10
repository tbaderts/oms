package org.example.streaming.controller;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.example.streaming.model.OrderDto;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.service.EventStreamProvider;
import org.junit.jupiter.api.Test;

import reactor.core.publisher.Flux;
import reactor.test.StepVerifier;

/** SPEC-0057 (review): the dev SSE stream keeps its pre-SPEC-0057 shape, without the marker. */
class TestStreamControllerTest {

    @Test
    void sseOrderStreamHasNoSnapshotEndMarker() {
        EventStreamProvider provider = mock(EventStreamProvider.class);
        OrderEvent snapshot = OrderEvent.fromOrder(OrderDto.builder().orderId("A").build(), "SNAPSHOT");
        OrderEvent live = OrderEvent.fromOrder(OrderDto.builder().orderId("B").build(), "UPDATE");
        when(provider.getOrderEventStream(true)).thenReturn(Flux.just(snapshot, OrderEvent.snapshotEnd(1), live));

        StepVerifier.create(new TestStreamController(provider).streamOrdersSSE().map(OrderEvent::getEventType))
                .expectNext("SNAPSHOT", "UPDATE")
                .verifyComplete();
    }
}
