package org.example.oms.repository;

import java.util.List;

import org.example.oms.model.OutboxMessage;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;

@Repository
public interface OutboxRepository extends JpaRepository<OutboxMessage, Long> {

    /**
     * Claims the oldest pending messages for publication.
     *
     * <p>Ordering by primary key is what preserves per-aggregate sequencing: messages for the same
     * order were staged in commit order, so draining them in id order publishes them in that same
     * order. {@code SKIP LOCKED} lets several relay instances run concurrently without contending
     * on the same rows — each takes a disjoint slice.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("SELECT o FROM OutboxMessage o WHERE o.attempts < :maxAttempts ORDER BY o.id ASC")
    List<OutboxMessage> claimPending(int maxAttempts, Limit limit);

    /** Messages that exhausted their retry budget and need operator attention. */
    long countByAttemptsGreaterThanEqual(int maxAttempts);
}
