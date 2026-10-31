package org.example.oms.repository;

import java.util.List;
import java.util.Optional;

import org.example.common.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;

import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Repository;

/**
 * Repository interface for Order entity persistence operations. Extends JpaRepository for CRUD operations
 * and JpaSpecificationExecutor for dynamic query support.
 *
 * <p>Key features:
 * <ul>
 *   <li>Standard CRUD operations via JpaRepository</li>
 *   <li>Dynamic query support via JpaSpecificationExecutor (used by OrderQueryService)</li>
 *   <li>Custom finders: findByOrderId, findLockedByOrderId (row lock for lifecycle commands),
 *       findByRootOrderId and findByParentOrderId (order trees, both lists)</li>
 *   <li>Uniqueness check: existsBySessionIdAndClOrdId</li>
 * </ul>
 *
 * @see <a href="file:///oms-knowledge-base/oms-framework/oms-state-store.md">State Store - Spring Data JPA Repository Pattern</a>
 * @see <a href="file:///oms-knowledge-base/oms-framework/domain-model_spec.md">Domain Model - Order Entity</a>
 */
@Repository
public interface OrderRepository
        extends JpaRepository<Order, Long>, JpaSpecificationExecutor<Order> {

    Optional<Order> findByOrderId(String orderId);

    /**
     * Loads the order under a row lock ({@code SELECT … FOR UPDATE}) held until the transaction ends.
     * Lifecycle commands on one order are serialised by it, so a concurrent duplicate waits, then
     * sees the first copy's committed event and is refused as a duplicate.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Order> findLockedByOrderId(String orderId);

    /** Every order in the tree under this root (children, grandchildren, …), not the root itself. */
    List<Order> findByRootOrderId(String rootOrderId);

    /** The order's direct children. */
    List<Order> findByParentOrderId(String parentOrderId);

    boolean existsBySessionIdAndClOrdId(String sessionId, String clOrdId);
}
