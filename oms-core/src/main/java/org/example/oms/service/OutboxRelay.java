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

import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OutboxRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

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
 * <p>Ordering holds for one relay instance. With several, {@code SKIP LOCKED} could let a second
 * instance claim later rows of an aggregate whose earlier rows the first one holds.
 */
@Component
@Slf4j
@ConditionalOnProperty(
        prefix = "kafka",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class OutboxRelay {

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

    public OutboxRelay(
            OutboxRepository outboxRepository,
            MessagePublisher messagePublisher,
            MeterRegistry meterRegistry,
            @Value("${kafka.outbox.batch-size:100}") int batchSize,
            @Value("${kafka.outbox.max-attempts:10}") int maxAttempts,
            @Value("${kafka.outbox.drain-timeout-ms:30000}") long drainTimeoutMs) {
        this.outboxRepository = outboxRepository;
        this.messagePublisher = messagePublisher;
        this.batchSize = batchSize;
        this.maxAttempts = maxAttempts;
        this.drainTimeoutMs = drainTimeoutMs;

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

    /**
     * Publishes one batch of pending messages.
     *
     * <p>The batch is sent inside the claiming transaction and awaited; acknowledged rows are deleted
     * and failed ones keep their row with the attempt count incremented, so a crash mid-batch leaves
     * the unsent remainder claimable by the next run.
     */
    @Scheduled(fixedDelayString = "${kafka.outbox.poll-interval-ms:200}")
    @Transactional
    public void drain() {
        List<OutboxMessage> pending =
                outboxRepository.claimPending(maxAttempts, Limit.of(batchSize));

        if (pending.isEmpty()) {
            return;
        }

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
            return;
        }

        Outcomes outcomes = new Outcomes();
        List<CompletableFuture<Void>> chains = new ArrayList<>(byAggregate.size());
        byAggregate.forEach((key, rows) -> chains.add(chain(key, rows, outcomes)));

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
    }

    /**
     * Sends one aggregate's rows in id order, each only after the previous one was acknowledged, and
     * stops at the first failure. Completes normally either way; the outcome of each row is recorded.
     */
    private CompletableFuture<Void> chain(AggregateKey key, List<OutboxMessage> rows, Outcomes outcomes) {
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
                        return send(key, row, outcomes);
                    },
                    sendExecutor);
        }
        return chain.thenAccept(last -> {});
    }

    /**
     * Sends one row; completes with whether the broker acknowledged it. The aggregate counts as in
     * flight until the send settles, even after the drain stopped waiting for it.
     */
    private CompletableFuture<Boolean> send(AggregateKey key, OutboxMessage row, Outcomes outcomes) {
        CompletableFuture<?> sent;
        try {
            sent = messagePublisher.publishAsync(row);
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
