package org.example.streaming.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.query.OrderDto;
import org.example.streaming.client.OmsQueryClient;
import org.example.streaming.mapper.OrderMessageMapper;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.StreamFilter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;
import reactor.kafka.receiver.KafkaReceiver;
import reactor.kafka.receiver.ReceiverOffset;
import reactor.kafka.receiver.ReceiverRecord;
import reactor.test.StepVerifier;

class KafkaEventStreamProviderTest {

    private final Sinks.Many<ReceiverRecord<String, OrderMessage>> orderRecords =
            Sinks.many().unicast().onBackpressureBuffer();

    private KafkaEventStreamProvider provider;

    @AfterEach
    void tearDown() {
        if (provider != null) {
            provider.shutdown();
        }
    }

    /**
     * SPEC-0018 AC-4. The snapshot reports each order's latest event version; a live event at or
     * below that version for the same order is already in the snapshot (or older), while newer
     * events and other orders' events must pass. Deduplicating on the bare number across orders
     * used to swallow order B's version 3 because order A's snapshot was at version 3.
     */
    @Test
    void snapshotDeduplicatesLiveEventsPerOrderByVersion() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        when(queryClient.fetchAllOrders())
                .thenReturn(Flux.just(snapshotOrder("A", 3L), snapshotOrder("B", 1L)));
        provider = startProvider(queryClient);

        StepVerifier.create(
                        provider.getOrderEventStream(StreamFilter.builder().includeSnapshot(true).build())
                                .map(KafkaEventStreamProviderTest::describe))
                .expectNext("SNAPSHOT A 3", "SNAPSHOT B 1")
                .then(
                        () -> {
                            emit("A", 2);
                            emit("A", 3);
                            emit("A", 4);
                            emit("B", 3);
                        })
                .expectNext("UPDATE A 4", "UPDATE B 3")
                .expectNoEvent(Duration.ofMillis(300))
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    private KafkaEventStreamProvider startProvider(OmsQueryClient queryClient) {
        @SuppressWarnings("unchecked")
        KafkaReceiver<String, OrderMessage> orderReceiver = mock(KafkaReceiver.class);
        @SuppressWarnings("unchecked")
        KafkaReceiver<String, Execution> executionReceiver = mock(KafkaReceiver.class);
        when(orderReceiver.receive()).thenReturn(orderRecords.asFlux());
        when(executionReceiver.receive()).thenReturn(Flux.never());

        KafkaEventStreamProvider started =
                new KafkaEventStreamProvider(
                        orderReceiver,
                        executionReceiver,
                        queryClient,
                        new OrderMessageMapper(),
                        mock(FilterService.class));
        started.startConsuming();
        return started;
    }

    private void emit(String orderId, long eventId) {
        // The no-arg constructor, not the builder: the builder insists on every field, and only
        // these three matter here.
        OrderMessage message = new OrderMessage();
        message.setOrderId(orderId);
        message.setRootOrderId(orderId);
        message.setEventId(eventId);
        orderRecords.tryEmitNext(
                new ReceiverRecord<>(
                        new ConsumerRecord<>("oms_orders", 0, eventId, orderId, message),
                        mock(ReceiverOffset.class)));
    }

    private static OrderDto snapshotOrder(String orderId, Long eventVersion) {
        return OrderDto.builder().id(100L).orderId(orderId).eventVersion(eventVersion).build();
    }

    private static String describe(OrderEvent event) {
        return event.getEventType() + " " + event.getOrderId() + " " + event.getEventId();
    }
}
