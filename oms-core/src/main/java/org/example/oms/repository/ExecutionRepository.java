package org.example.oms.repository;

import java.math.BigDecimal;

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

    /**
     * Sum of lastQty × lastPx over the order's applied fills, zero when it has none: the numerator
     * of the order's average price (SPEC-0041).
     */
    @Query("select coalesce(sum(e.lastQty * e.lastPx), 0) from Execution e where e.orderId = :orderId")
    BigDecimal sumNotionalByOrderId(@Param("orderId") String orderId);
}
