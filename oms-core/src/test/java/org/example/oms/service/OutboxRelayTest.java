package org.example.oms.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import java.util.function.Function;

import org.example.common.model.Order;
import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.service.leadership.Leadership;
import org.example.oms.service.leadership.Role;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.support.SendResult;
import org.springframework.transaction.support.TransactionOperations;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * The relay publishes every aggregate's rows in id order, one after another, while the aggregates
 * proceed in parallel, and a failure holds back only its own aggregate (SPEC-0026).
 */
@ExtendWith(MockitoExtension.class)
class OutboxRelayTest {

    private static final int MAX_ATTEMPTS = 3;

    @Mock private OutboxRepository outboxRepository;
    @Mock private Leadership leadership;

    private final FakePublisher publisher = new FakePublisher();
    private final SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    private OutboxRelay relay;

    @BeforeEach
    void setUp() {
        relay = new OutboxRelay(outboxRepository, publisher, meterRegistry, leadership, TransactionOperations.withoutTransaction(), 100, MAX_ATTEMPTS, 5_000);
    }

    @AfterEach
    void tearDown() {
        relay.shutdown();
        publisher.scheduler.shutdownNow();
    }

    @Test
    void drain_publishesAndRemovesEachMessage() {
        OutboxMessage first = message(1L, "A");
        OutboxMessage second = message(2L, "B");
        claim(first, second);

        relay.drainBatch();

        assertEquals(List.of(1L, 2L), publisher.sentIds().stream().sorted().toList());
        verify(outboxRepository).delete(first);
        verify(outboxRepository).delete(second);
    }

    /**
     * A failed send must leave the row in place — losing it is exactly the failure mode the relay
     * exists to prevent.
     */
    @Test
    void drain_whenPublishFails_keepsTheMessageAndCountsTheAttempt() {
        OutboxMessage message = message(1L, "A");
        claim(message);
        publisher.answer = m -> failed("broker down");

        relay.drainBatch();

        verify(outboxRepository, never()).delete(message);
        assertEquals(1, message.getAttempts());
        assertEquals("broker down", message.getLastError());
    }

    @Test
    void drain_whenNothingPending_doesNothing() {
        when(outboxRepository.claimPending(any(Integer.class), any())).thenReturn(List.of());

        relay.drainBatch();

        assertTrue(publisher.sentIds().isEmpty());
    }

    // AC-1
    @Test
    void failureHoldsOnlyItsAggregate() {
        OutboxMessage a1 = message(1L, "A");
        OutboxMessage b1 = message(2L, "B");
        OutboxMessage a2 = message(3L, "A");
        OutboxMessage b2 = message(4L, "B");
        claim(a1, b1, a2, b2);
        publisher.answer = m -> m == a1 ? failed("poison") : acked(m);

        relay.drainBatch();

        assertEquals(List.of(1L, 2L, 4L), publisher.sentIds().stream().sorted().toList(), "A2 is never sent");
        verify(outboxRepository).delete(b1);
        verify(outboxRepository).delete(b2);
        verify(outboxRepository, never()).delete(a1);
        verify(outboxRepository, never()).delete(a2);
        assertEquals(1, a1.getAttempts());
        assertEquals("poison", a1.getLastError());
        assertEquals(0, a2.getAttempts(), "A2 was not attempted");
    }

    // AC-2: the same key on another topic is another aggregate; on the same topic, A2 waits for A1's ack.
    @Test
    void rowsOfOneAggregateAreSentInIdOrderAfterEachAck() throws Exception {
        OutboxMessage a1 = message(1L, "A");
        OutboxMessage a2 = message(2L, "A");
        claim(a1, a2);
        Map<Long, CompletableFuture<SendResult<String, Object>>> pending = new ConcurrentHashMap<>();
        publisher.answer = m -> pending.computeIfAbsent(m.getId(), id -> new CompletableFuture<>());

        Thread drain = Thread.ofPlatform().start(relay::drainBatch);
        await(() -> pending.containsKey(1L), "A1 sent");
        Thread.sleep(200);
        assertFalse(pending.containsKey(2L), "A2 must wait for A1's acknowledgement");

        pending.get(1L).complete(null);
        await(() -> pending.containsKey(2L), "A2 sent after A1's ack");
        pending.get(2L).complete(null);
        drain.join(5_000);

        assertEquals(List.of(1L, 2L), publisher.sentIds());
        verify(outboxRepository).delete(a1);
        verify(outboxRepository).delete(a2);
    }

    // AC-2: a failure raised while sending (mapping, serialization) stops the aggregate.
    @Test
    void synchronousFailureStopsTheAggregate() {
        OutboxMessage a1 = message(1L, "A");
        OutboxMessage a2 = message(2L, "A");
        claim(a1, a2);
        publisher.answer = m -> {
            if (m == a1) {
                throw new IllegalStateException("no payload");
            }
            return acked(m);
        };

        relay.drainBatch();

        assertEquals(List.of(1L), publisher.sentIds());
        verify(outboxRepository, never()).delete(a2);
        assertEquals(1, a1.getAttempts());
        assertEquals("no payload", a1.getLastError());
    }

    // AC-2: a failure reported by the broker after the send stops the aggregate too.
    @Test
    void asynchronousFailureStopsTheAggregate() {
        OutboxMessage a1 = message(1L, "A");
        OutboxMessage a2 = message(2L, "A");
        claim(a1, a2);
        publisher.answer = m -> m == a1 ? later(failed("not leader")) : acked(m);

        relay.drainBatch();

        assertEquals(List.of(1L), publisher.sentIds());
        verify(outboxRepository, never()).delete(a1);
        verify(outboxRepository, never()).delete(a2);
        assertEquals(1, a1.getAttempts());
    }

    // AC-2, review: when the drain stops waiting, an unfinished row is neither deleted nor charged
    // (a broker outage must not spend attempt budgets), and nothing behind it is sent.
    @Test
    void timeoutLeavesUnfinishedRowsUntouched() {
        relay.shutdown();
        relay = new OutboxRelay(outboxRepository, publisher, meterRegistry, leadership, TransactionOperations.withoutTransaction(), 100, MAX_ATTEMPTS, 300);
        OutboxMessage a1 = message(1L, "A");
        OutboxMessage b1 = message(2L, "B");
        OutboxMessage a2 = message(3L, "A");
        claim(a1, b1, a2);
        publisher.answer = m -> m == a1 ? new CompletableFuture<>() : acked(m);

        relay.drainBatch();

        assertEquals(List.of(1L, 2L), publisher.sentIds().stream().sorted().toList(), "A2 waits behind A1");
        verify(outboxRepository).delete(b1);
        verify(outboxRepository, never()).delete(a1);
        verify(outboxRepository, never()).delete(a2);
        assertEquals(0, a1.getAttempts(), "an unanswered send is not a failure");
        assertEquals(0, a2.getAttempts());
    }

    // AC-2, review: an acknowledgement after the drain gave up neither sends the next row nor
    // touches the entities; the row is resent, in order, by the next drain.
    @Test
    void lateAcknowledgementAfterTheDrainChangesNothing() throws Exception {
        relay.shutdown();
        relay = new OutboxRelay(outboxRepository, publisher, meterRegistry, leadership, TransactionOperations.withoutTransaction(), 100, MAX_ATTEMPTS, 300);
        OutboxMessage a1 = message(1L, "A");
        OutboxMessage a2 = message(2L, "A");
        claim(a1, a2);
        CompletableFuture<SendResult<String, Object>> late = new CompletableFuture<>();
        publisher.answer = m -> m == a1 ? late : acked(m);

        relay.drainBatch();
        late.complete(null);
        Thread.sleep(300);

        assertEquals(List.of(1L), publisher.sentIds(), "A2 is not sent after the drain stopped waiting");
        verify(outboxRepository, never()).delete(a1);
        assertEquals(0, a1.getAttempts());
    }

    // AC-2: the aggregate is topic and key; a failure on one topic does not hold the same key on another.
    @Test
    void sameKeyOnAnotherTopicIsAnotherAggregate() {
        OutboxMessage orders1 = message(1L, "A");
        OutboxMessage executions1 = message(2L, "A", "oms_executions");
        OutboxMessage orders2 = message(3L, "A");
        claim(orders1, executions1, orders2);
        publisher.answer = m -> m == orders1 ? failed("poison") : acked(m);

        relay.drainBatch();

        assertEquals(List.of(1L, 2L), publisher.sentIds().stream().sorted().toList());
        verify(outboxRepository).delete(executions1);
        verify(outboxRepository, never()).delete(orders2);
    }

    // Second review: a broker that cannot be reached (here: no topic metadata within max.block.ms)
    // is retriable. It stops the aggregate and is recorded, but costs no attempt.
    @Test
    void retriableFailureCostsNoAttempt() {
        OutboxMessage a1 = message(1L, "A");
        OutboxMessage a2 = message(2L, "A");
        claim(a1, a2);
        publisher.answer = m -> CompletableFuture.failedFuture(
                new org.apache.kafka.common.errors.TimeoutException("Topic oms_orders not present in metadata after 10000 ms."));

        relay.drainBatch();

        assertEquals(List.of(1L), publisher.sentIds(), "A2 waits behind A1");
        verify(outboxRepository, never()).delete(a1);
        assertEquals(0, a1.getAttempts(), "an unreachable broker costs no attempt");
        assertTrue(a1.getLastError().contains("not present in metadata"), a1.getLastError());
    }

    // Second review: the schema registry unreachable from the serializer is transient too.
    @Test
    void unreachableRegistryCostsNoAttempt() {
        OutboxMessage a1 = message(1L, "A");
        claim(a1);
        publisher.answer = m -> {
            throw new org.apache.kafka.common.errors.SerializationException(
                    "Error serializing Avro message", new java.io.IOException("Connection refused"));
        };

        relay.drainBatch();

        assertEquals(0, a1.getAttempts());
        assertEquals("Error serializing Avro message", a1.getLastError());
    }

    // Second review: while a send of an aggregate from an earlier drain has not settled, later
    // drains leave the aggregate alone, so a resend can never land after a newer record.
    @Test
    void aggregateWithASendStillInFlightIsSkipped() {
        relay.shutdown();
        relay = new OutboxRelay(outboxRepository, publisher, meterRegistry, leadership, TransactionOperations.withoutTransaction(), 100, MAX_ATTEMPTS, 300);
        OutboxMessage a1 = message(1L, "A");
        OutboxMessage b1 = message(2L, "B");
        claim(a1, b1);
        CompletableFuture<SendResult<String, Object>> stillInFlight = new CompletableFuture<>();
        AtomicInteger a1Sends = new AtomicInteger();
        publisher.answer = m -> m == a1 && a1Sends.getAndIncrement() == 0 ? stillInFlight : acked(m);

        relay.drainBatch();
        relay.drainBatch();
        assertEquals(1, a1Sends.get(), "A1 is not sent again while its first send is in flight");

        stillInFlight.complete(null);
        relay.drainBatch();
        assertEquals(2, a1Sends.get(), "after the first send settled, A1 is resent, in order");
        verify(outboxRepository).delete(a1);
        assertEquals(0, a1.getAttempts());
    }

    @Test
    void failureWithoutMessageRecordsItsType() {
        OutboxMessage a1 = message(1L, "A");
        claim(a1);
        publisher.answer = m -> CompletableFuture.failedFuture(new NullPointerException());

        relay.drainBatch();

        assertEquals(1, a1.getAttempts());
        assertTrue(a1.getLastError() != null && a1.getLastError().contains("NullPointerException"), a1.getLastError());
    }

    // AC-3
    @Test
    void aggregatesAreInFlightTogether() {
        List<OutboxMessage> rows = new ArrayList<>();
        for (int i = 1; i <= 20; i++) {
            rows.add(message(i, "AGG-" + i));
        }
        claim(rows.toArray(OutboxMessage[]::new));
        publisher.answer = m -> publisher.ackAfter(m, Duration.ofMillis(200));

        long started = System.nanoTime();
        relay.drainBatch();
        Duration took = Duration.ofNanos(System.nanoTime() - started);

        assertEquals(20, publisher.sentIds().size());
        assertTrue(took.compareTo(Duration.ofSeconds(2)) < 0, "sequential would take 4 s, took " + took);
        assertTrue(publisher.maxInFlight.get() > 1, "in flight together: " + publisher.maxInFlight.get());
        rows.forEach(row -> verify(outboxRepository).delete(row));
    }

    // AC-5
    @Test
    void oldestAgeIsZeroWhenNothingPending() {
        when(outboxRepository.findOldestPendingCreatedAt(MAX_ATTEMPTS))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(Instant.now().minusSeconds(5)));

        assertEquals(0.0, oldestAge());
        assertTrue(oldestAge() >= 5.0, "the oldest pending row is five seconds old");
    }

    // ----------------------------------------------------------------------------------------

    private double oldestAge() {
        return meterRegistry.get("oms.outbox.oldest.age").gauge().value();
    }

    // --- SPEC-0048: one leader, serial drains, draining while full -------------------------------

    @Test
    void aFollowerDoesNothing() {
        when(leadership.holds(Role.OUTBOX_RELAY)).thenReturn(false);

        relay.drainAll();

        verify(outboxRepository, never()).claimPending(any(Integer.class), any());
    }

    @Test
    void aFullBatchIsFollowedByAnotherAtOnce() {
        when(leadership.holds(Role.OUTBOX_RELAY)).thenReturn(true);
        relay = new OutboxRelay(outboxRepository, publisher, meterRegistry, leadership, TransactionOperations.withoutTransaction(), 2, MAX_ATTEMPTS, 5_000);
        when(outboxRepository.claimPending(any(Integer.class), any()))
                .thenReturn(List.of(message(1L, "A"), message(2L, "B")))
                .thenReturn(List.of(message(3L, "C"), message(4L, "D")))
                .thenReturn(List.of(message(5L, "E")));

        relay.drainAll();

        assertEquals(List.of(1L, 2L, 3L, 4L, 5L), publisher.sentIds().stream().sorted().toList(),
                "every row in one drain, not one batch per poll");
        verify(outboxRepository, org.mockito.Mockito.times(3)).claimPending(any(Integer.class), any());
    }

    @Test
    void drainsOfOneInstanceNeverOverlap() throws Exception {
        when(leadership.holds(Role.OUTBOX_RELAY)).thenReturn(true);
        AtomicInteger running = new AtomicInteger();
        AtomicInteger maxRunning = new AtomicInteger();
        AtomicInteger calls = new AtomicInteger();
        when(outboxRepository.claimPending(any(Integer.class), any())).thenAnswer(invocation -> {
            maxRunning.accumulateAndGet(running.incrementAndGet(), Math::max);
            calls.incrementAndGet();
            Thread.sleep(20);
            running.decrementAndGet();
            return List.of();
        });

        var pool = Executors.newFixedThreadPool(8);
        try {
            List<java.util.concurrent.Future<?>> drains = new ArrayList<>();
            for (int i = 0; i < 8; i++) {
                drains.add(pool.submit(relay::drainAll));
            }
            for (var drain : drains) {
                drain.get(10, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }

        assertEquals(1, maxRunning.get(), "one drain at a time");
        assertTrue(calls.get() >= 1);
    }

    // --- SPEC-0048 review: leader handover -----------------------------------------------------

    @Test
    void leadershipIsCheckedAgainBeforeEveryBatch() {
        // Leader when the drain starts and for its first batch, then the lock is lost.
        when(leadership.holds(Role.OUTBOX_RELAY)).thenReturn(true, true, false);
        relay = new OutboxRelay(outboxRepository, publisher, meterRegistry, leadership, TransactionOperations.withoutTransaction(), 2, MAX_ATTEMPTS, 5_000);
        when(outboxRepository.claimPending(any(Integer.class), any()))
                .thenReturn(List.of(message(1L, "A"), message(2L, "B")))
                .thenReturn(List.of(message(3L, "C"), message(4L, "D")));

        relay.drainAll();

        verify(outboxRepository, org.mockito.Mockito.times(1)).claimPending(any(Integer.class), any());
        assertEquals(1.0, meterRegistry.get("oms.outbox.drains").counter().count(), "one batch claimed");
    }

    @Test
    void stopWaitsForARunningDrainAndRefusesNewOnes() throws Exception {
        when(leadership.holds(Role.OUTBOX_RELAY)).thenReturn(true);
        java.util.concurrent.CountDownLatch entered = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
        when(outboxRepository.claimPending(any(Integer.class), any())).thenAnswer(invocation -> {
            entered.countDown();
            release.await(10, TimeUnit.SECONDS);
            return List.of();
        });
        Thread drain = Thread.ofPlatform().start(relay::drainAll);
        assertTrue(entered.await(5, TimeUnit.SECONDS));

        Thread stopping = Thread.ofPlatform().start(relay::stop);
        stopping.join(300);
        assertTrue(stopping.isAlive(), "stop waits for the running drain before leadership may be released");
        release.countDown();
        stopping.join(5_000);
        drain.join(5_000);
        assertFalse(stopping.isAlive());
        assertFalse(relay.isRunning());

        relay.drainAll();
        verify(outboxRepository, org.mockito.Mockito.times(1)).claimPending(any(Integer.class), any());
    }

    private void claim(OutboxMessage... rows) {
        when(outboxRepository.claimPending(any(Integer.class), any())).thenReturn(List.of(rows));
    }

    private static OutboxMessage message(long id, String aggregate) {
        return message(id, aggregate, "oms_orders");
    }

    private static OutboxMessage message(long id, String aggregate, String topic) {
        return OutboxMessage.builder()
                .id(id)
                .aggregateType(OutboxMessage.AggregateType.ORDER)
                .aggregateId(aggregate)
                .topic(topic)
                .orderPayload(Order.builder().orderId(aggregate).build())
                .createdAt(Instant.now())
                .attempts(0)
                .build();
    }

    private static CompletableFuture<SendResult<String, Object>> acked(OutboxMessage message) {
        return CompletableFuture.completedFuture(null);
    }

    private static CompletableFuture<SendResult<String, Object>> failed(String error) {
        return CompletableFuture.failedFuture(new IllegalStateException(error));
    }

    /** Completes like {@code outcome}, but only after the send has returned. */
    private CompletableFuture<SendResult<String, Object>> later(CompletableFuture<SendResult<String, Object>> outcome) {
        CompletableFuture<SendResult<String, Object>> future = new CompletableFuture<>();
        publisher.scheduler.schedule(
                () -> outcome.whenComplete((result, failure) -> {
                    if (failure != null) {
                        future.completeExceptionally(failure);
                    } else {
                        future.complete(result);
                    }
                }),
                50, TimeUnit.MILLISECONDS);
        return future;
    }

    private static void await(BooleanSupplier condition, String what) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (!condition.getAsBoolean()) {
            if (System.nanoTime() > deadline) {
                throw new AssertionError("Timed out waiting for: " + what);
            }
            Thread.sleep(10);
        }
    }

    /** Records what is sent, in order, and answers with whatever the test sets. */
    private static final class FakePublisher extends MessagePublisher {

        final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);
        final AtomicInteger inFlight = new AtomicInteger();
        final AtomicInteger maxInFlight = new AtomicInteger();
        private final List<Long> sent = java.util.Collections.synchronizedList(new ArrayList<>());
        volatile Function<OutboxMessage, CompletableFuture<SendResult<String, Object>>> answer = OutboxRelayTest::acked;

        FakePublisher() {
            super(null, null, null, null, null);
        }

        @Override
        public CompletableFuture<SendResult<String, Object>> publishAsync(OutboxMessage message) {
            sent.add(message.getId());
            return answer.apply(message);
        }

        CompletableFuture<SendResult<String, Object>> ackAfter(OutboxMessage message, Duration delay) {
            maxInFlight.accumulateAndGet(inFlight.incrementAndGet(), Math::max);
            CompletableFuture<SendResult<String, Object>> future = new CompletableFuture<>();
            scheduler.schedule(() -> {
                inFlight.decrementAndGet();
                future.complete(null);
            }, delay.toMillis(), TimeUnit.MILLISECONDS);
            return future;
        }

        List<Long> sentIds() {
            synchronized (sent) {
                return List.copyOf(sent);
            }
        }
    }
}
