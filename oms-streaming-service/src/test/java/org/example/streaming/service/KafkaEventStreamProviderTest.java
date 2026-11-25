package org.example.streaming.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.query.OrderDto;
import org.example.streaming.client.OmsQueryClient;
import org.example.streaming.mapper.ExecutionMessageMapper;
import org.example.streaming.mapper.OrderMessageMapper;
import org.example.streaming.model.ExecutionDto;
import org.example.streaming.model.ExecutionEvent;
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

/**
 * The stream provider holds no state (SPEC-0071): snapshots come from oms-core at each
 * subscription, live events from Kafka ({@code oms_orders}, {@code oms_executions}), and the only
 * deduplication is per subscription, against the versions its snapshot saw (SPEC-0018, SPEC-0057).
 */
class KafkaEventStreamProviderTest {

    private final Sinks.Many<ReceiverRecord<String, OrderMessage>> orderRecords =
            Sinks.many().unicast().onBackpressureBuffer();

    private final Sinks.Many<ReceiverRecord<String, Execution>> fillRecords =
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
     * events and other orders' events must pass.
     */
    @Test
    void snapshotDeduplicatesLiveEventsPerOrderByVersion() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        when(queryClient.fetchOrderSnapshot(any(), anyInt()))
                .thenReturn(orderSnapshot(2, snapshotOrder("A", 3L), snapshotOrder("B", 1L)));
        provider = startProvider(queryClient);

        StepVerifier.create(
                        provider.getOrderEventStream(StreamFilter.builder().includeSnapshot(true).build())
                                .map(KafkaEventStreamProviderTest::describe))
                .expectNext("SNAPSHOT A 3", "SNAPSHOT B 1", "SNAPSHOT_END 2")
                .then(() -> {
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

    /** SPEC-0057 AC-3. The order snapshot is the client's, limited, then the matching count. */
    @Test
    void orderSnapshotIsLimitedAndEndsWithMatchingCount() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        StreamFilter filter = StreamFilter.builder().includeSnapshot(true).snapshotLimit(2).build();
        when(queryClient.fetchOrderSnapshot(filter, 2))
                .thenReturn(orderSnapshot(8300, snapshotOrder("C", 1L), snapshotOrder("B", 1L)));
        provider = startProvider(queryClient);

        StepVerifier.create(provider.getOrderEventStream(filter).map(KafkaEventStreamProviderTest::describe))
                .expectNext("SNAPSHOT C 1", "SNAPSHOT B 1", "SNAPSHOT_END 8300")
                .then(() -> emit("D", 1))
                .expectNext("UPDATE D 1")
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    /**
     * SPEC-0071 AC-1. The execution snapshot is the execution search's answer for the stream's filter
     * and limit, in its order (newest stored first), then the marker with its matching count.
     */
    @Test
    void executionSnapshotComesFromTheSearchAndEndsWithItsCount() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        StreamFilter filter = StreamFilter.builder().includeSnapshot(true).snapshotLimit(2)
                .filters(StreamFilter.eq("symbol", "AAPL").getFilters()).build();
        when(queryClient.fetchExecutionSnapshot(filter, 2))
                .thenReturn(executionSnapshot(7, stored("B", "E1", 5L), stored("A", "E2", 2L)));
        provider = startProvider(queryClient);

        StepVerifier.create(provider.getExecutionEventStream(filter).map(KafkaEventStreamProviderTest::describe))
                .expectNext("SNAPSHOT B/E1 AAPL", "SNAPSHOT A/E2 AAPL", "SNAPSHOT_END 7")
                .thenCancel()
                .verify(Duration.ofSeconds(5));
        verify(queryClient).fetchExecutionSnapshot(filter, 2);
    }

    /**
     * SPEC-0071 AC-2. The snapshot is read at each subscription: a fill deleted from the database since
     * the last one is not shown again, without a restart.
     */
    @Test
    void executionSnapshotIsReadAtEachSubscription() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        when(queryClient.fetchExecutionSnapshot(any(), anyInt()))
                .thenReturn(executionSnapshot(2, stored("A", "E2", 2L), stored("A", "E1", 1L)))
                .thenReturn(executionSnapshot(1, stored("A", "E2", 2L)));
        provider = startProvider(queryClient);
        StreamFilter withSnapshot = StreamFilter.withSnapshot();

        StepVerifier.create(provider.getExecutionEventStream(withSnapshot).map(KafkaEventStreamProviderTest::describe))
                .expectNext("SNAPSHOT A/E2 AAPL", "SNAPSHOT A/E1 AAPL", "SNAPSHOT_END 2")
                .thenCancel()
                .verify(Duration.ofSeconds(5));
        StepVerifier.create(provider.getExecutionEventStream(withSnapshot).map(KafkaEventStreamProviderTest::describe))
                .expectNext("SNAPSHOT A/E2 AAPL", "SNAPSHOT_END 1")
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    /** SPEC-0071 AC-3. Live fills are the Execution records of oms_executions, with their instrument. */
    @Test
    void liveExecutionsComeFromTheExecutionRecord() {
        provider = startProvider(mock(OmsQueryClient.class));

        StepVerifier.create(provider.getExecutionEventStream(StreamFilter.liveOnly()))
                .then(() -> emitFill("A", "E1", 3L))
                .assertNext(event -> {
                    assertEquals("F", event.getEventType());
                    assertEquals("A", event.getOrderId());
                    assertEquals("E1", event.getExecId());
                    assertEquals("AAPL", event.getExecution().getSymbol());
                    assertEquals(0, BigDecimal.TEN.compareTo(event.getExecution().getLastQty()));
                    assertEquals(3L, event.getExecution().getOrderVersion());
                })
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    /**
     * SPEC-0071 AC-4 (SPEC-0057 AC-8). A live fill at or below the version the subscription's snapshot
     * saw for that (orderId, execId) is already shown; a higher version, or another fill, is new.
     */
    @Test
    void liveFillAtOrBelowTheSnapshotVersionIsNotEmitted() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        when(queryClient.fetchExecutionSnapshot(any(), anyInt()))
                .thenReturn(executionSnapshot(1, stored("A", "E1", 3L)));
        provider = startProvider(queryClient);

        StepVerifier.create(provider.getExecutionEventStream(StreamFilter.withSnapshot())
                        .map(KafkaEventStreamProviderTest::describe))
                .expectNext("SNAPSHOT A/E1 AAPL", "SNAPSHOT_END 1")
                .then(() -> {
                    emitFill("A", "E1", 2L);
                    emitFill("A", "E1", 3L);
                    emitFill("A", "E1", 4L);
                    emitFill("B", "E1", 1L);
                })
                .expectNext("F A/E1 AAPL", "F B/E1 AAPL")
                .expectNoEvent(Duration.ofMillis(300))
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    /**
     * SPEC-0071 (review): a filter on the fill's own fields applies to live fills as it does to the
     * snapshot (which passes it to the execution search): symbol and securityId (SPEC-0069), and
     * status — every fill on oms_executions is an applied one.
     */
    @Test
    void liveFillsAreFilteredOnTheirInstrumentAndStatus() {
        provider = startProvider(mock(OmsQueryClient.class));
        StreamFilter aaplApplied = StreamFilter.builder().includeSnapshot(false)
                .filters(java.util.List.of(
                        org.example.streaming.model.FilterCondition.eq("symbol", "AAPL"),
                        org.example.streaming.model.FilterCondition.eq("status", "APPLIED")))
                .build();

        StepVerifier.create(provider.getExecutionEventStream(aaplApplied).map(KafkaEventStreamProviderTest::describe))
                .then(() -> {
                    emitFill("A", "E1", 1L, "MSFT");
                    emitFill("A", "E2", 2L, "AAPL");
                })
                .expectNext("F A/E2 AAPL")
                .expectNoEvent(Duration.ofMillis(300))
                .thenCancel()
                .verify(Duration.ofSeconds(5));
        StepVerifier.create(provider.getExecutionEventStream(StreamFilter.builder().includeSnapshot(false)
                                .filters(java.util.List.of(org.example.streaming.model.FilterCondition.eq("status", "BUSTED")))
                                .build())
                        .map(KafkaEventStreamProviderTest::describe))
                .then(() -> emitFill("B", "E1", 1L, "AAPL"))
                .expectNoEvent(Duration.ofMillis(300))
                .thenCancel()
                .verify(Duration.ofSeconds(5));
    }

    /** SPEC-0071 AC-5. Without oms-core there is no snapshot to serve: the subscription errors. */
    @Test
    void snapshotFailsWhenOmsCoreFails() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        IllegalStateException down = new IllegalStateException("oms-core down");
        when(queryClient.fetchOrderSnapshot(any(), anyInt()))
                .thenReturn(new OmsQueryClient.OrderSnapshot(Flux.error(down), Mono.error(down)));
        when(queryClient.fetchExecutionSnapshot(any(), anyInt()))
                .thenReturn(new OmsQueryClient.ExecutionSnapshot(Flux.error(down), Mono.error(down)));
        provider = startProvider(queryClient);
        emit("A", 1);

        StepVerifier.create(provider.getOrderEventStream(StreamFilter.withSnapshot()))
                .expectErrorMessage("oms-core down")
                .verify(Duration.ofSeconds(5));
        StepVerifier.create(provider.getExecutionEventStream(StreamFilter.withSnapshot()))
                .expectErrorMessage("oms-core down")
                .verify(Duration.ofSeconds(5));
    }

    /** SPEC-0071 AC-5 and SPEC-0057 AC-4. A live-only stream never asks oms-core and sends no snapshot. */
    @Test
    void liveOnlyStreamNeedsNoOmsCore() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        provider = startProvider(queryClient);

        StepVerifier.create(provider.getExecutionEventStream(StreamFilter.liveOnly())
                        .map(KafkaEventStreamProviderTest::describe))
                .then(() -> emitFill("A", "E2", 2L))
                .recordWith(ArrayList::new)
                .thenConsumeWhile(event -> !event.equals("F A/E2 AAPL"))
                .consumeRecordedWith(events -> assertTrue(
                        events.stream().noneMatch(event -> event.startsWith("SNAPSHOT")), events.toString()))
                .expectNext("F A/E2 AAPL")
                .thenCancel()
                .verify(Duration.ofSeconds(5));
        StepVerifier.create(provider.getOrderEventStream(StreamFilter.liveOnly()).map(KafkaEventStreamProviderTest::describe))
                .then(() -> emit("O", 1))
                .expectNext("UPDATE O 1")
                .thenCancel()
                .verify(Duration.ofSeconds(5));
        verifyNoInteractions(queryClient);
    }

    /** SPEC-0071 AC-6. Nothing is loaded at startup: there is no cache to warm. */
    @Test
    void startupCallsNoOmsCore() {
        OmsQueryClient queryClient = mock(OmsQueryClient.class);
        provider = startProvider(queryClient);

        verifyNoInteractions(queryClient);
    }

    /**
     * SPEC-0057 AC-6. A client that stops requesting must not make the server buffer without limit: past
     * the per-subscriber bound its stream ends with an error, and the overflow is counted.
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

    private KafkaEventStreamProvider startProvider(OmsQueryClient queryClient) {
        @SuppressWarnings("unchecked")
        KafkaReceiver<String, OrderMessage> orderReceiver = mock(KafkaReceiver.class);
        @SuppressWarnings("unchecked")
        KafkaReceiver<String, Execution> executionReceiver = mock(KafkaReceiver.class);
        when(orderReceiver.receive()).thenReturn(orderRecords.asFlux());
        when(executionReceiver.receive()).thenReturn(fillRecords.asFlux());

        KafkaEventStreamProvider started = new KafkaEventStreamProvider(
                orderReceiver,
                executionReceiver,
                queryClient,
                new OrderMessageMapper(),
                new ExecutionMessageMapper(),
                new FilterService(),
                meters);
        started.startConsuming();
        return started;
    }

    private void emitFill(String orderId, String execId, long orderVersion) {
        emitFill(orderId, execId, orderVersion, "AAPL");
    }

    private void emitFill(String orderId, String execId, long orderVersion, String symbol) {
        Execution fill = new Execution();
        fill.setOrderId(orderId);
        fill.setRootOrderId(orderId);
        fill.setExecId(execId);
        fill.setSymbol(symbol);
        fill.setLastQty(BigDecimal.TEN);
        fill.setExecType("F");
        fill.setOrderVersion(orderVersion);
        fillRecords.tryEmitNext(new ReceiverRecord<>(
                new ConsumerRecord<>("oms_executions", 0, orderVersion, orderId, fill),
                mock(ReceiverOffset.class)));
    }

    private void emit(String orderId, long eventId) {
        // The no-arg constructor, not the builder: the builder insists on every field.
        OrderMessage message = new OrderMessage();
        message.setOrderId(orderId);
        message.setRootOrderId(orderId);
        message.setEventId(eventId);
        orderRecords.tryEmitNext(new ReceiverRecord<>(
                new ConsumerRecord<>("oms_orders", 0, eventId, orderId, message),
                mock(ReceiverOffset.class)));
    }

    private static OrderDto snapshotOrder(String orderId, Long eventVersion) {
        return OrderDto.builder().id(100L).orderId(orderId).eventVersion(eventVersion).build();
    }

    private static ExecutionDto stored(String orderId, String execId, long orderVersion) {
        return ExecutionDto.builder().orderId(orderId).execId(execId).symbol("AAPL").orderVersion(orderVersion).build();
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
        return event.getEventType() + " " + event.getOrderId() + "/" + event.getExecId() + " "
                + event.getExecution().getSymbol();
    }

    private static OmsQueryClient.OrderSnapshot orderSnapshot(long matching, OrderDto... newestFirst) {
        return new OmsQueryClient.OrderSnapshot(Flux.just(newestFirst), Mono.just(matching));
    }

    private static OmsQueryClient.ExecutionSnapshot executionSnapshot(long matching, ExecutionDto... newestFirst) {
        return new OmsQueryClient.ExecutionSnapshot(Flux.just(newestFirst), Mono.just(matching));
    }
}
