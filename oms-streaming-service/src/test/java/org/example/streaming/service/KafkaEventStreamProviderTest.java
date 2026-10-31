package org.example.streaming.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.query.OrderDto;
import org.example.streaming.client.OmsQueryClient;
import org.example.streaming.mapper.OrderExecutionMapper;
import org.example.streaming.mapper.OrderMessageMapper;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.StreamFilter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;
import reactor.kafka.receiver.KafkaReceiver;
import reactor.kafka.receiver.ReceiverOffset;
import reactor.kafka.receiver.ReceiverRecord;
import reactor.test.StepVerifier;

class KafkaEventStreamProviderTest {

    private final Sinks.Many<ReceiverRecord<String, OrderMessage>> orderRecords =
            Sinks.many().unicast().onBackpressureBuffer();

    private final Sinks.Many<ReceiverRecord<String, OrderExecution>> fillRecords =
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

    /**
     * SPEC-0019 AC-7. The relay publishes at least once, so the same fill can arrive twice; it carries
     * the same (orderId, execId, orderVersion) both times and must reach the blotter once. A new fill of the
     * same order, with a higher version, must still pass.
     */
    @Test
    void orderExecutionRedelivery_isEmittedOnce() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        when(queryClient.fetchAllOrders()).thenReturn(Flux.empty());
        provider = startProvider(queryClient);

        StepVerifier.create(
                        provider.getExecutionEventStream(false)
                                .map(e -> e.getExecId() + " " + e.getExecution().getOrderVersion()))
                .then(
                        () -> {
                            emitFill("A", "X1", 3L);
                            emitFill("A", "X1", 3L);
                            emitFill("A", "X2", 4L);
                        })
                .expectNext("X1 3", "X2 4")
                .expectNoEvent(Duration.ofMillis(300))
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    /**
     * execId is unique per order only (the executions table is unique on (orderId, execId)), so two
     * orders may share one. A fill on B must not be taken for a redelivery of A's.
     */
    @Test
    void sameExecIdOnTwoOrders_isNotARedelivery() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        when(queryClient.fetchAllOrders()).thenReturn(Flux.empty());
        provider = startProvider(queryClient);

        StepVerifier.create(
                        provider.getExecutionEventStream(false)
                                .map(e -> e.getOrderId() + " " + e.getExecId() + " " + e.getExecution().getOrderVersion()))
                .then(
                        () -> {
                            emitFill("A", "F1", 3L);
                            emitFill("B", "F1", 3L);
                        })
                .expectNext("A F1 3", "B F1 3")
                .expectNoEvent(Duration.ofMillis(300))
                .thenCancel()
                .verify(Duration.ofSeconds(5));
        assertEquals(2, provider.getExecutionCacheSize(), "both fills cached, neither overwrites the other");
    }

    private KafkaEventStreamProvider startProvider(OmsQueryClient queryClient) {
        @SuppressWarnings("unchecked")
        KafkaReceiver<String, OrderMessage> orderReceiver = mock(KafkaReceiver.class);
        @SuppressWarnings("unchecked")
        KafkaReceiver<String, OrderExecution> orderExecutionReceiver = mock(KafkaReceiver.class);
        when(orderReceiver.receive()).thenReturn(orderRecords.asFlux());
        when(orderExecutionReceiver.receive()).thenReturn(fillRecords.asFlux());

        KafkaEventStreamProvider started =
                new KafkaEventStreamProvider(
                        orderReceiver,
                        orderExecutionReceiver,
                        queryClient,
                        new OrderMessageMapper(),
                        new OrderExecutionMapper(),
                        mock(FilterService.class));
        // @Value is not applied outside Spring; at 0 every cache put would be evicted at once.
        ReflectionTestUtils.setField(started, "maxCacheSize", 100);
        started.startConsuming();
        return started;
    }

    private void emitFill(String orderId, String execId, long orderVersion) {
        OrderExecution fill = new OrderExecution();
        fill.setOrderId(orderId);
        fill.setRootOrderId(orderId);
        fill.setExecId(execId);
        fill.setOrderVersion(orderVersion);
        fillRecords.tryEmitNext(
                new ReceiverRecord<>(
                        new ConsumerRecord<>("oms_order_executions", 0, orderVersion, orderId, fill),
                        mock(ReceiverOffset.class)));
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
