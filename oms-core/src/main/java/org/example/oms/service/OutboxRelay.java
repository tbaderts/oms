package org.example.oms.service;

import java.util.List;

import org.example.oms.model.OutboxMessage;
import org.example.oms.repository.OutboxRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;

/**
 * Drains the outbox to Kafka.
 *
 * <p>This is the component that makes the outbox pattern an actual guarantee rather than a shape.
 * Previously the only thing that read the outbox table was an {@code AFTER_COMMIT} listener that had
 * just written to it, so a broker outage or a crash between commit and send orphaned the row
 * permanently — nothing ever retried it and nothing reported it.
 *
 * <p>Two properties fall out of draining in primary-key order:
 *
 * <ul>
 *   <li>Per-aggregate ordering. Rows were staged in commit order, so publishing in id order puts an
 *       order's state transitions on its partition in the order they actually happened. Publishing
 *       from the committing thread could not guarantee this — two threads could commit in one order
 *       and reach {@code send()} in the other.
 *   <li>The broker is off the request path. A slow or unreachable Kafka no longer adds latency to
 *       the HTTP call or blocks the command consumer thread.
 * </ul>
 *
 * <p>A message that fails {@code maxAttempts} times stops being retried and is left in the table for
 * operators, counted by the {@code oms.outbox.stuck} gauge. Silent loss is the one outcome this
 * class is built to prevent.
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

    public OutboxRelay(
            OutboxRepository outboxRepository,
            MessagePublisher messagePublisher,
            MeterRegistry meterRegistry,
            @Value("${kafka.outbox.batch-size:100}") int batchSize,
            @Value("${kafka.outbox.max-attempts:10}") int maxAttempts) {
        this.outboxRepository = outboxRepository;
        this.messagePublisher = messagePublisher;
        this.batchSize = batchSize;
        this.maxAttempts = maxAttempts;

        meterRegistry.gauge(
                "oms.outbox.pending", outboxRepository, OutboxRepository::count);
        meterRegistry.gauge(
                "oms.outbox.stuck",
                outboxRepository,
                repo -> repo.countByAttemptsGreaterThanEqual(maxAttempts));
    }

    /**
     * Publishes one batch of pending messages.
     *
     * <p>Each message is sent inside the claiming transaction and deleted only after the broker
     * acknowledges it, so a crash mid-batch leaves the unsent remainder claimable by the next run.
     * A message that fails is left in place with its attempt count incremented; the send is retried
     * on a later pass rather than blocking the ones behind it indefinitely.
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

        for (OutboxMessage message : pending) {
            try {
                messagePublisher.publish(message);
                outboxRepository.delete(message);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                message.recordFailure("Interrupted while publishing");
                log.warn("Outbox drain interrupted at message {}", message.getId());
                return;
            } catch (Exception e) {
                message.recordFailure(e.getMessage());
                log.error(
                        "Failed to publish outbox message {} ({} {}), attempt {}/{}: {}",
                        message.getId(),
                        message.getAggregateType(),
                        message.getAggregateId(),
                        message.getAttempts(),
                        maxAttempts,
                        e.getMessage());

                if (message.getAttempts() >= maxAttempts) {
                    log.error(
                            "Outbox message {} exhausted its retry budget and will not be retried. "
                                    + "It remains in the outbox table for manual replay.",
                            message.getId());
                }

                // Stop the batch here: continuing would publish later messages for the same
                // aggregate ahead of this one and break per-order ordering.
                return;
            }
        }
    }
}
