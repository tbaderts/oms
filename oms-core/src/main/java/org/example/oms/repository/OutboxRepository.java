package org.example.oms.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.example.oms.model.OutboxMessage;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

@Repository
public interface OutboxRepository extends JpaRepository<OutboxMessage, Long> {

    /**
     * Claims the oldest pending messages for publication.
     *
     * <p>Ordering by primary key is what preserves per-aggregate sequencing: messages for the same
     * order were staged in commit order, so draining them in id order publishes them in that same
     * order.
     *
     * <p>The claim waits for rows another transaction holds; it does not skip them (SPEC-0048). Exactly
     * one relay drains, but during a leader handover the old leader may still hold a claim, and
     * skipping its rows would let the new leader publish the same aggregate's later rows first. The
     * wait lasts as long as the old leader's claiming transaction, which awaits the broker for at most
     * {@code drain-timeout-ms}, or until its session dies.
     *
     * <p>An aggregate (topic and key) with a message that exhausted its attempts is held: its later
     * messages are not claimed, so they are never published ahead of the stuck one (SPEC-0026).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT o FROM OutboxMessage o
            WHERE o.attempts < :maxAttempts
              AND NOT EXISTS (SELECT 1 FROM OutboxMessage s
                              WHERE s.topic = o.topic AND s.aggregateId = o.aggregateId
                                AND s.attempts >= :maxAttempts)
            ORDER BY o.id ASC""")
    List<OutboxMessage> claimPending(int maxAttempts, Limit limit);

    /** Messages that exhausted their retry budget and need operator attention. */
    long countByAttemptsGreaterThanEqual(int maxAttempts);

    /** When the oldest message still to be published was staged (SPEC-0026); empty when none is. */
    @Query("SELECT MIN(o.createdAt) FROM OutboxMessage o WHERE o.attempts < :maxAttempts")
    Optional<Instant> findOldestPendingCreatedAt(int maxAttempts);
}
