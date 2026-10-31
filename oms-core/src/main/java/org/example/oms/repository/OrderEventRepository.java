package org.example.oms.repository;

import java.util.Collection;
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

    /** Whether the order has already applied a command with this commandId. */
    boolean existsByOrderIdAndCommandId(String orderId, String commandId);

    /**
     * Highest version per order, for a page of query results. Orders without events are absent.
     */
    @Query("SELECT e.orderId AS orderId, MAX(e.version) AS version FROM OrderEvent e "
            + "WHERE e.orderId IN :orderIds GROUP BY e.orderId")
    List<OrderVersion> findLatestVersions(Collection<String> orderIds);

    /** An order's latest event-log version. */
    interface OrderVersion {
        String getOrderId();

        long getVersion();
    }

    /** The latest event at or below a target version — the basis for replay. */
    Optional<OrderEvent> findFirstByOrderIdAndVersionLessThanEqualOrderByVersionDesc(
            String orderId, long version);
}
