package org.example.streaming.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.query.OrderDto;
import org.example.streaming.client.OmsQueryClient;
import org.example.streaming.mapper.OrderExecutionMapper;
import org.example.streaming.mapper.OrderMessageMapper;
import org.example.streaming.model.ExecutionEvent;
import org.example.streaming.model.FilterCondition;
import org.example.streaming.model.OrderEvent;
import org.example.streaming.model.StreamFilter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
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

    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();

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
        when(queryClient.fetchOrderSnapshot(any(), anyInt()))
                .thenReturn(snapshot(2, snapshotOrder("A", 3L), snapshotOrder("B", 1L)));
        provider = startProvider(queryClient);

        StepVerifier.create(
                        provider.getOrderEventStream(StreamFilter.builder().includeSnapshot(true).build())
                                .map(KafkaEventStreamProviderTest::describe))
                .expectNext("SNAPSHOT A 3", "SNAPSHOT B 1", "SNAPSHOT_END 2")
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
     * SPEC-0057 AC-3. The client keeps at most its limit; the server sends at most that many orders, the
     * newest, as the Query API returns them (highest id first), then a marker with how many matched.
     */
    @Test
    void orderSnapshotIsLimitedAndEndsWithMatchingCount() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        StreamFilter filter = StreamFilter.builder().includeSnapshot(true).snapshotLimit(2).build();
        when(queryClient.fetchOrderSnapshot(filter, 2))
                .thenReturn(snapshot(8300, snapshotOrder("C", 1L), snapshotOrder("B", 1L)));
        provider = startProvider(queryClient);

        StepVerifier.create(provider.getOrderEventStream(filter).map(KafkaEventStreamProviderTest::describe))
                .expectNext("SNAPSHOT C 1", "SNAPSHOT B 1", "SNAPSHOT_END 8300")
                .then(() -> emit("D", 1))
                .expectNext("UPDATE D 1")
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    /**
     * SPEC-0057 AC-3, oms-core unavailable: the snapshot comes from the cache, still limited, and the
     * marker counts the cached orders that match.
     */
    @Test
    void orderSnapshotFromTheCacheIsLimitedToo() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        when(queryClient.fetchOrderSnapshot(any(), anyInt()))
                .thenReturn(new OmsQueryClient.OrderSnapshot(
                        Flux.error(new IllegalStateException("oms-core down")), Mono.just(0L)));
        provider = startProvider(queryClient);
        emit("A", 1);
        emit("B", 1);
        emit("C", 1);

        StepVerifier.create(provider.getOrderEventStream(
                                StreamFilter.builder().includeSnapshot(true).snapshotLimit(2).build())
                        .map(e -> e.getEventType().equals(OrderEvent.SNAPSHOT_END) ? describe(e) : e.getEventType()))
                .expectNext("SNAPSHOT", "SNAPSHOT", "SNAPSHOT_END 3")
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    /**
     * SPEC-0057 AC-3. The execution snapshot comes from the cache: the newest matching fills by
     * transactTime, at most the client's limit, newest first, then the marker with how many matched.
     * The filter applies to the snapshot, never to the marker.
     */
    @Test
    void executionSnapshotIsNewestByTransactTimeAndEndsWithMatchingCount() {
        provider = startProvider(mock(OmsQueryClient.class));
        emitFill("A", "E1", 1L, 100);
        emitFill("A", "E2", 2L, 300);
        emitFill("B", "E1", 1L, 400);
        emitFill("A", "E3", 3L, 200);
        awaitCachedExecutions(4);

        StreamFilter onA = StreamFilter.builder()
                .filters(List.of(FilterCondition.eq("orderId", "A")))
                .includeSnapshot(true)
                .snapshotLimit(2)
                .build();
        StepVerifier.create(provider.getExecutionEventStream(onA).map(KafkaEventStreamProviderTest::describe))
                .expectNext("SNAPSHOT A/E2", "SNAPSHOT A/E3", "SNAPSHOT_END 3")
                .then(() -> {
                    emitFill("B", "E2", 2L, 500);
                    emitFill("A", "E4", 4L, 600);
                })
                .expectNext("NEW A/E4")
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    /**
     * SPEC-0057 AC-4. Without a snapshot, no snapshot is sent, though the cache holds fills: only live
     * events follow. (The live sink replays its most recent events to a new subscriber, as before
     * SPEC-0057; those are live events, not a snapshot.)
     */
    @Test
    void executionStreamWithoutSnapshotSendsOnlyLiveEvents() {
        provider = startProvider(mock(OmsQueryClient.class));
        emitFill("A", "E1", 1L, 100);
        awaitCachedExecutions(1);

        StepVerifier.create(provider.getExecutionEventStream(StreamFilter.liveOnly())
                        .map(KafkaEventStreamProviderTest::describe))
                .then(() -> emitFill("A", "E2", 2L, 200))
                .recordWith(ArrayList::new)
                .thenConsumeWhile(event -> !event.equals("NEW A/E2"))
                .consumeRecordedWith(events -> assertTrue(
                        events.stream().noneMatch(event -> event.startsWith("SNAPSHOT")), events.toString()))
                .expectNext("NEW A/E2")
                .expectNoEvent(Duration.ofMillis(300))
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    /**
     * SPEC-0057 AC-6. A client that stops requesting must not make the server buffer without limit: past
     * the per-subscriber bound its stream ends with an error (the blotter offers Retry, which reloads
     * a snapshot), and the overflow is counted.
     */
    @Test
    void slowSubscriberOverflowEndsTheStream() {
        provider = startProvider(mock(OmsQueryClient.class));
        ReflectionTestUtils.setField(provider, "maxPendingPerSubscriber", 5);

        StepVerifier.create(provider.getOrderEventStream(StreamFilter.liveOnly()), 0)
                .then(() -> {
                    for (int i = 1; i <= 10; i++) {
                        emit("O-" + i, 1);
                    }
                })
                .thenAwait(Duration.ofMillis(200))
                .thenRequest(Long.MAX_VALUE)
                .expectNextCount(5)
                .expectError(IllegalStateException.class)
                .verify(Duration.ofSeconds(5));
        assertEquals(1.0, meters.counter("oms.streaming.subscriber.overflow", "route", "orders.stream").count());
    }

    /** SPEC-0057 AC-6. A subscriber that keeps up is never cut off, however many events pass. */
    @Test
    void subscriberThatKeepsUpIsNotCutOff() {
        provider = startProvider(mock(OmsQueryClient.class));
        ReflectionTestUtils.setField(provider, "maxPendingPerSubscriber", 5);

        StepVerifier.create(provider.getOrderEventStream(StreamFilter.liveOnly()))
                .then(() -> {
                    for (int i = 1; i <= 20; i++) {
                        emit("O-" + i, 1);
                    }
                })
                .expectNextCount(20)
                .thenCancel()
                .verify(Duration.ofSeconds(5));
        assertEquals(0.0, meters.counter("oms.streaming.subscriber.overflow", "route", "orders.stream").count());
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
                        provider.getExecutionEventStream(StreamFilter.liveOnly())
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
                        provider.getExecutionEventStream(StreamFilter.liveOnly())
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
                        new FilterService(),
                        meters);
        // @Value is not applied outside Spring; at 0 every cache put would be evicted at once.
        ReflectionTestUtils.setField(started, "maxCacheSize", 100);
        started.startConsuming();
        return started;
    }

    private void emitFill(String orderId, String execId, long orderVersion) {
        emitFill(orderId, execId, orderVersion, null);
    }

    private void emitFill(String orderId, String execId, long orderVersion, Integer transactSecond) {
        OrderExecution fill = new OrderExecution();
        if (transactSecond != null) {
            fill.setTransactTime(Instant.ofEpochSecond(transactSecond));
        }
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
        if (OrderEvent.SNAPSHOT_END.equals(event.getEventType())) {
            return event.getEventType() + " " + event.getSnapshotTotal();
        }
        return event.getEventType() + " " + event.getOrderId() + " " + event.getEventId();
    }

    private static String describe(ExecutionEvent event) {
        if (OrderEvent.SNAPSHOT_END.equals(event.getEventType())) {
            return event.getEventType() + " " + event.getSnapshotTotal();
        }
        return event.getEventType() + " " + event.getOrderId() + "/" + event.getExecId();
    }

    /** Fills reach the cache on the consumer's thread; wait until it holds them. */
    private void awaitCachedExecutions(int count) {
        long deadline = System.currentTimeMillis() + 5000;
        while (provider.getExecutionCacheSize() < count && System.currentTimeMillis() < deadline) {
            Thread.onSpinWait();
        }
        assertEquals(count, provider.getExecutionCacheSize());
    }

    private static OmsQueryClient.OrderSnapshot snapshot(long matching, OrderDto... newestFirst) {
        return new OmsQueryClient.OrderSnapshot(Flux.just(newestFirst), Mono.just(matching));
    }
}
