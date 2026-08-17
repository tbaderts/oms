package org.example.oms.repository;

import java.util.List;
import java.util.Optional;

import org.example.oms.model.OrderEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

@Repository
public interface OrderEventRepository extends JpaRepository<OrderEvent, Long> {

    List<OrderEvent> findByOrderIdOrderByVersionAsc(String orderId);

    /** Highest version appended for an order, or empty if the order has no events yet. */
    @Query("SELECT MAX(e.version) FROM OrderEvent e WHERE e.orderId = :orderId")
    Optional<Long> findMaxVersionByOrderId(String orderId);

    /** The latest event at or below a target version — the basis for replay. */
    Optional<OrderEvent> findFirstByOrderIdAndVersionLessThanEqualOrderByVersionDesc(
            String orderId, long version);
}
