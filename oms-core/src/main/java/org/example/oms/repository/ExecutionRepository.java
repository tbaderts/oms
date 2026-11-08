package org.example.oms.repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import org.example.common.model.Execution;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ExecutionRepository extends JpaRepository<Execution, Long> {

    /**
     * Idempotency check for redelivered execution reports. Kafka delivery is at-least-once, so the
     * same fill can arrive twice; without this it would be applied twice and double-count cumQty.
     */
    boolean existsByOrderIdAndExecId(String orderId, String execId);

    /** The order's execution with this execId, the venue's id, unique per order. */
    Optional<Execution> findByOrderIdAndExecId(String orderId, String execId);

    /**
     * Sum of lastQty × lastPx over the order's applied fills, zero when it has none: the numerator
     * of the order's average price (SPEC-0041). A busted or corrected fill no longer counts (SPEC-0044).
     */
    @Query("select coalesce(sum(e.lastQty * e.lastPx), 0) from Execution e"
            + " where e.orderId = :orderId and e.status = org.example.common.model.ExecutionStatus.APPLIED")
    BigDecimal sumNotionalByOrderId(@Param("orderId") String orderId);

    /**
     * The order's executions in force at an event version: applied at or before it, and not busted or
     * corrected by then, in the order they were applied (SPEC-0044).
     */
    @Query("select e from Execution e where e.orderId = :orderId and e.orderVersion <= :version"
            + " and (e.bustedAtVersion is null or e.bustedAtVersion > :version) order by e.orderVersion")
    List<Execution> findInForceAt(@Param("orderId") String orderId, @Param("version") long version);
}
