package org.example.oms.repository;

import org.example.common.model.Execution;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExecutionRepository extends JpaRepository<Execution, Long> {

    /**
     * Idempotency check for redelivered execution reports. Kafka delivery is at-least-once, so the
     * same fill can arrive twice; without this it would be applied twice and double-count cumQty.
     */
    boolean existsByOrderIdAndExecID(String orderId, String execID);
}
