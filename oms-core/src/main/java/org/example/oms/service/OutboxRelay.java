package org.example.oms.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;

import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OutboxRepository;
import org.example.oms.service.leadership.Leadership;
import org.example.oms.service.leadership.Role;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionOperations;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;

/**
 * Drains the outbox to Kafka.
 *
 * <p>This is the component that makes the outbox pattern an actual guarantee rather than a shape.
 * Previously the only thing that read the outbox table was an {@code AFTER_COMMIT} listener that had
 * just written to it, so a broker outage or a crash between commit and send orphaned the row
 * permanently — nothing ever retried it and nothing reported it.
 *
 * <p>Ordering is per <em>aggregate</em>: one topic and Kafka key, so one partition. Rows were staged
 * in commit order, so publishing an aggregate's rows in id order puts an order's state transitions
 * on its partition in the order they actually happened. Each row of an aggregate is sent only after
 * the previous one was acknowledged, and a failure stops that aggregate for the rest of the drain;
 * the failed row is the earliest of its aggregate again on the next poll. Different aggregates are
 * independent: their rows are in flight together, and one failing order does not delay the others
 * (SPEC-0026). The broker stays off the request path.
 *
 * <p>A message that fails {@code maxAttempts} times stops being retried and is left in the table for
 * operators, counted by the {@code oms.outbox.stuck} gauge. The later rows of its aggregate are held
 * behind it rather than published out of order. {@code oms.outbox.oldest.age} shows how long the
 * oldest row has been waiting. Silent loss is the one outcome this class is built to prevent.
 *
 * <p>Ordering holds because exactly one drainer exists (SPEC-0048). Of several instances, only the
 * one holding the {@link Role#OUTBOX_RELAY} leadership drains; the others do nothing. Within that
 * instance, drains run one at a time. Leadership is re-checked before every batch, and this relay
 * stops (waiting for its drain and its sends in flight) before leadership is released at shutdown.
 * Should two relays still overlap, after a session loss mid-drain, the claim waits for rows another
 * relay holds rather than skipping them, so an aggregate's later rows are never published first.
 *
 * <p>A drain runs after every commit that staged rows, nudged by {@link OutboxNudge}, and keeps
 * draining while its batches come back full. The poll is the fallback: for commits on other
 * instances, crashes between commit and nudge, and rows that are waiting to be retried.
 */
@Component
@Slf4j
@ConditionalOnProperty(
        prefix = "kafka",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class OutboxRelay implements SmartLifecycle {

    private final OutboxRepository outboxRepository;
    private final MessagePublisher messagePublisher;
    private final int batchSize;
    private final int maxAttempts;
    private final long drainTimeoutMs;

    /**
     * Runs the steps of every aggregate's chain, each on its own virtual thread. It keeps the next
     * send off the producer's callback thread, where a full buffer would block the producer's own
     * I/O, and a send that blocks inside the producer (metadata, a full buffer, a registry lookup,
     * up to {@code max.block.ms}) stalls only its own aggregate.
     */
    private final ExecutorService sendExecutor =
            Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("outbox-relay-send-", 0).factory());

    private final Leadership leadership;
    private final OutboxPayloads outboxPayloads;
    private final io.micrometer.core.instrument.Counter drains;
    private final TransactionOperations transactions;

    /** Drains of this instance run one at a time; see the class comment. */
    private final ReentrantLock draining = new ReentrantLock();

    /** Set when a drain was asked for while another ran: the running one drains once more. */
    private final AtomicBoolean again = new AtomicBoolean();

    /** Runs nudged drains off the committing thread; at most one nudge waits at a time. */
    private final ExecutorService nudgeExecutor =
            Executors.newSingleThreadExecutor(Thread.ofPlatform().name("outbox-relay-nudge").daemon().factory());

    private final AtomicBoolean nudgeQueued = new AtomicBoolean();

    public OutboxRelay(
            OutboxRepository outboxRepository,
            MessagePublisher messagePublisher,
            OutboxPayloads outboxPayloads,
            MeterRegistry meterRegistry,
            Leadership leadership,
            TransactionOperations transactions,
            @Value("${kafka.outbox.batch-size:100}") int batchSize,
            @Value("${kafka.outbox.max-attempts:10}") int maxAttempts,
            @Value("${kafka.outbox.drain-timeout-ms:30000}") long drainTimeoutMs) {
        this.outboxRepository = outboxRepository;
        this.messagePublisher = messagePublisher;
        this.outboxPayloads = outboxPayloads;
        this.leadership = leadership;
        this.transactions = transactions;
        this.batchSize = batchSize;
        this.maxAttempts = maxAttempts;
        this.drainTimeoutMs = drainTimeoutMs;
        this.drains = io.micrometer.core.instrument.Counter.builder("oms.outbox.drains")
                .description("Outbox batches claimed by this instance; stays 0 on a follower (SPEC-0048)")
                .register(meterRegistry);

        meterRegistry.gauge(
                "oms.outbox.pending", outboxRepository, OutboxRepository::count);
        meterRegistry.gauge(
                "oms.outbox.stuck",
                outboxRepository,
                repo -> repo.countByAttemptsGreaterThanEqual(maxAttempts));
        Gauge.builder("oms.outbox.oldest.age", outboxRepository, this::oldestPendingAgeSeconds)
                .description("Age of the oldest outbox row still to be published")
                .baseUnit("seconds")
                .register(meterRegistry);
    }

    /** Aggregates with a send not yet settled, across drains: at most one per aggregate. */
    private final Set<AggregateKey> inFlight = ConcurrentHashMap.newKeySet();

    /** An ordering scope: rows of one topic and key land on one partition, in order. */
    private record AggregateKey(String topic, String aggregateId) {}

    /** What happened to each row of one drain; written by the chains, read by the drain thread. */
    private static final class Outcomes {
        final Set<OutboxMessage> acknowledged = ConcurrentHashMap.newKeySet();
        final Map<OutboxMessage, Throwable> failed = new ConcurrentHashMap<>();
        final AtomicBoolean closed = new AtomicBoolean();
    }

    /** The fallback: drains on a fixed delay, whatever nudges arrived (SPEC-0048). */
    @Scheduled(fixedDelayString = "${kafka.outbox.poll-interval-ms:200}")
    public void poll() {
        drainAll();
    }

    /**
     * Asks for a drain now, off the caller's thread; called after a commit that staged rows. Nudges
     * that arrive while one is waiting coalesce: one drain covers them all.
     */
    public void nudge() {
        if (nudgeQueued.compareAndSet(false, true)) {
            try {
                nudgeExecutor.execute(() -> {
                    nudgeQueued.set(false);
                    drainAll();
                });
            } catch (java.util.concurrent.RejectedExecutionException e) {
                // Shutting down: the next instance's poll publishes the rows.
                nudgeQueued.set(false);
            }
        }
    }

    /**
     * Drains until the outbox has nothing more to publish now, if this instance is the relay leader.
     * A drain asked for while another runs is folded into the running one.
     */
    public void drainAll() {
        if (!running || !leadership.holds(Role.OUTBOX_RELAY)) {
            return;
        }
        again.set(true);
        while (again.get()) {
            if (!draining.tryLock()) {
                return; // the running drain sees `again` and drains once more
            }
            try {
                while (again.getAndSet(false)) {
                    BatchResult batch;
                    do {
                        // Leadership is checked before every batch, not once per drain: a lock lost
                        // meanwhile (session loss) stops this instance at the next batch.
                        if (!running || !leadership.holds(Role.OUTBOX_RELAY)) {
                            again.set(false);
                            return;
                        }
                        batch = transactions.execute(status -> drainBatch());
                    } while (batch != null && batch.claimed() == batchSize && batch.published() > 0);
                }
            } finally {
                draining.unlock();
            }
        }
    }

    // --- Lifecycle (SPEC-0048 review): stop before leadership is released ----------------------

    private volatile boolean running = true;

    @Override
    public void start() {
        running = true;
    }

    /**
     * Stops draining, then waits, up to {@code drain-timeout-ms}, for a running drain and for sends
     * still in flight. It runs before {@link Leadership#stop()} (higher phase), so the lock is released
     * only when this instance has nothing claimed and nothing in flight: a successor never overlaps it.
     */
    @Override
    public void stop() {
        running = false;
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(drainTimeoutMs);
        try {
            if (draining.tryLock(drainTimeoutMs, TimeUnit.MILLISECONDS)) {
                draining.unlock();
            } else {
                log.warn("Outbox relay stopping while a drain still runs after {} ms", drainTimeoutMs);
            }
            while (!inFlight.isEmpty() && System.nanoTime() < deadline) {
                Thread.sleep(20);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (!inFlight.isEmpty()) {
            log.warn("Outbox relay stopping with {} send(s) still unacknowledged", inFlight.size());
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    /** Stopped before {@link Leadership} (whose phase is lower), so the lock outlives the last drain. */
    @Override
    public int getPhase() {
        return Integer.MAX_VALUE - 50;
    }

    /** What one batch did: rows claimed, and rows the broker acknowledged. */
    record BatchResult(int claimed, int published) {}

    /**
     * Publishes one batch of pending messages, in the caller's transaction.
     *
     * <p>The batch is sent inside the claiming transaction and awaited; acknowledged rows are deleted
     * and failed ones keep their row with the attempt count incremented, so a crash mid-batch leaves
     * the unsent remainder claimable by the next run.
     */
    BatchResult drainBatch() {
        List<OutboxMessage> pending =
                outboxRepository.claimPending(maxAttempts, Limit.of(batchSize));

        if (pending.isEmpty()) {
            return new BatchResult(0, 0);
        }
        drains.increment();

        log.debug("Draining {} outbox messages", pending.size());

        Map<AggregateKey, List<OutboxMessage>> byAggregate = new LinkedHashMap<>();
        for (OutboxMessage message : pending) {
            AggregateKey key = new AggregateKey(message.getTopic(), message.getAggregateId());
            if (inFlight.contains(key)) {
                // A send of an earlier drain has not settled: resending now could land after a
                // newer record. Its rows wait, untouched, until it does.
                continue;
            }
            byAggregate.computeIfAbsent(key, k -> new ArrayList<>()).add(message);
        }
        if (byAggregate.isEmpty()) {
            return new BatchResult(pending.size(), 0); // every aggregate is still in flight
        }

        // Records are built here, on the drain thread and in the claiming transaction, before any
        // send: a pointer row's record is read from order_events or executions (SPEC-0047).
        Map<OutboxMessage, OutboxPayloads.Resolution> records = outboxPayloads.resolve(
                byAggregate.values().stream().flatMap(List::stream).toList());

        Outcomes outcomes = new Outcomes();
        List<CompletableFuture<Void>> chains = new ArrayList<>(byAggregate.size());
        byAggregate.forEach((key, rows) -> chains.add(chain(key, rows, records, outcomes)));

        try {
            CompletableFuture.allOf(chains.toArray(CompletableFuture[]::new))
                    .get(drainTimeoutMs, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Outbox drain interrupted while awaiting the broker");
        } catch (TimeoutException e) {
            log.warn("Outbox drain timed out after {} ms awaiting the broker", drainTimeoutMs);
        } catch (ExecutionException e) {
            // Chains complete normally; a failure is recorded in the outcomes, not thrown.
            log.error("Outbox drain chain failed unexpectedly", e);
        } finally {
            outcomes.closed.set(true);
        }

        apply(byAggregate.values(), outcomes);
        return new BatchResult(pending.size(), outcomes.acknowledged.size());
    }

    /**
     * Sends one aggregate's rows in id order, each only after the previous one was acknowledged, and
     * stops at the first failure. Completes normally either way; the outcome of each row is recorded.
     */
    private CompletableFuture<Void> chain(
            AggregateKey key,
            List<OutboxMessage> rows,
            Map<OutboxMessage, OutboxPayloads.Resolution> records,
            Outcomes outcomes) {
        CompletableFuture<Boolean> chain = CompletableFuture.completedFuture(true);
        for (OutboxMessage row : rows) {
            chain = chain.thenComposeAsync(
                    previousAcknowledged -> {
                        if (!previousAcknowledged) {
                            return CompletableFuture.completedFuture(false);
                        }
                        // Marked in flight before checking closed: a drain that starts once this one
                        // has closed then either sees the mark or this step sees closed. Never both
                        // drains send the row.
                        inFlight.add(key);
                        if (outcomes.closed.get()) {
                            inFlight.remove(key);
                            return CompletableFuture.completedFuture(false);
                        }
                        return send(key, row, records.get(row), outcomes);
                    },
                    sendExecutor);
        }
        return chain.thenAccept(last -> {});
    }

    /**
     * Sends one row; completes with whether the broker acknowledged it. The aggregate counts as in
     * flight until the send settles, even after the drain stopped waiting for it.
     */
    private CompletableFuture<Boolean> send(
            AggregateKey key, OutboxMessage row, OutboxPayloads.Resolution record, Outcomes outcomes) {
        CompletableFuture<?> sent;
        try {
            // A row whose record could not be built fails like a rejected send: definitively, so
            // its attempts count and the chain stops here (SPEC-0047).
            sent = record.failure() != null
                    ? CompletableFuture.failedFuture(record.failure())
                    : messagePublisher.publishAsync(row, record.record());
        } catch (RuntimeException e) {
            sent = CompletableFuture.failedFuture(e);
        }
        return sent.handle((result, failure) -> {
            inFlight.remove(key);
            if (failure == null) {
                outcomes.acknowledged.add(row);
                return true;
            }
            outcomes.failed.put(row, unwrap(failure));
            return false;
        });
    }

    /**
     * Deletes the acknowledged rows and records each definitive failure, on the drain thread, in the
     * claiming transaction.
     *
     * <p>A row the drain stopped waiting for, in flight or never sent, is left exactly as it was: it
     * is not a failure, so it costs no attempt, and the next drain sends it again in order. Charging
     * it would let a broker outage exhaust every pending aggregate's attempts and hold them all
     * (SPEC-0026 review). The producer retries transient errors itself, for longer than a drain.
     */
    private void apply(Iterable<List<OutboxMessage>> aggregates, Outcomes outcomes) {
        int unfinished = 0;
        for (List<OutboxMessage> rows : aggregates) {
            for (OutboxMessage row : rows) {
                if (outcomes.acknowledged.contains(row)) {
                    outboxRepository.delete(row);
                    continue;
                }
                Throwable failure = outcomes.failed.get(row);
                if (failure != null && isTransient(failure)) {
                    row.recordTransientFailure(describe(failure));
                    log.warn(
                            "Outbox message {} ({} {}) not published, will retry without counting an attempt: {}",
                            row.getId(),
                            row.getAggregateType(),
                            row.getAggregateId(),
                            describe(failure));
                } else if (failure != null) {
                    recordFailure(row, describe(failure));
                } else {
                    unfinished++;
                }
                break;
            }
        }
        if (unfinished > 0) {
            log.warn(
                    "Outbox drain stopped waiting with {} aggregate(s) unacknowledged; they are sent again "
                            + "on the next poll",
                    unfinished);
        }
    }

    /**
     * Whether a failure is the broker or the schema registry being unreachable rather than a
     * problem with the message: a Kafka {@code RetriableException} (including a send that timed out
     * waiting for metadata) or an I/O error anywhere in the cause chain. Those cost no attempt, so
     * an outage only delays publication (SPEC-0026).
     */
    static boolean isTransient(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof org.apache.kafka.common.errors.RetriableException
                    || cause instanceof java.io.IOException) {
                return true;
            }
            if (cause.getCause() == cause) {
                break;
            }
        }
        return false;
    }

    private static String describe(Throwable failure) {
        return failure.getMessage() != null ? failure.getMessage() : failure.toString();
    }

    private void recordFailure(OutboxMessage message, String error) {
        message.recordFailure(error);
        log.error(
                "Failed to publish outbox message {} ({} {}), attempt {}/{}: {}",
                message.getId(),
                message.getAggregateType(),
                message.getAggregateId(),
                message.getAttempts(),
                maxAttempts,
                error);

        if (message.getAttempts() >= maxAttempts) {
            log.error(
                    "Outbox message {} exhausted its retry budget and will not be retried. It remains in "
                            + "the outbox table for manual replay, and holds the later messages of {} on {}.",
                    message.getId(),
                    message.getAggregateId(),
                    message.getTopic());
        }
    }

    private double oldestPendingAgeSeconds(OutboxRepository repository) {
        return repository.findOldestPendingCreatedAt(maxAttempts)
                .map(oldest -> Math.max(0, Duration.between(oldest, Instant.now()).toMillis() / 1000.0))
                .orElse(0.0);
    }

    private static Throwable unwrap(Throwable failure) {
        Throwable cause = failure;
        while ((cause instanceof java.util.concurrent.CompletionException || cause instanceof ExecutionException)
                && cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause;
    }

    /**
     * Lets running chain steps finish briefly. A step that does not finish, or is rejected, leaves its
     * row untouched, so it is sent again after the restart.
     */
    @PreDestroy
    void shutdown() {
        nudgeExecutor.shutdownNow();
        sendExecutor.shutdown();
        try {
            if (!sendExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                sendExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            sendExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
