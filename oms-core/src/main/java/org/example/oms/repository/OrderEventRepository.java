package org.example.oms.repository;

import java.util.List;
import java.util.Optional;

import org.example.oms.model.OrderEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface OrderEventRepository extends JpaRepository<OrderEvent, Long> {

    List<OrderEvent> findByOrderIdOrderByVersionAsc(String orderId);

    /** One event of an order, by the unique {@code (order_id, version)}; read back for a pointer outbox row (SPEC-0047). */
    Optional<OrderEvent> findByOrderIdAndVersion(String orderId, long version);

    /** The entries about one execution of the order, in version order (SPEC-0044). */
    List<OrderEvent> findByOrderIdAndExecIdOrderByVersionAsc(String orderId, String execId);

    /** Whether the order has already applied a command with this commandId. */
    boolean existsByOrderIdAndCommandId(String orderId, String commandId);

    /** The latest event at or below a target version — the basis for replay. */
    Optional<OrderEvent> findFirstByOrderIdAndVersionLessThanEqualOrderByVersionDesc(
            String orderId, long version);
}
