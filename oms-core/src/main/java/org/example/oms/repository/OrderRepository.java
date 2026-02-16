package org.example.oms.repository;

import java.util.Optional;

import org.example.common.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

/**
 * Repository interface for Order entity persistence operations. Extends JpaRepository for CRUD operations
 * and JpaSpecificationExecutor for dynamic query support.
 *
 * <p>Key features:
 * <ul>
 *   <li>Standard CRUD operations via JpaRepository</li>
 *   <li>Dynamic query support via JpaSpecificationExecutor (used by OrderQueryService)</li>
 *   <li>Custom finders: findByOrderId, findByRootOrderId</li>
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

    Optional<Order> findByRootOrderId(String rootOrderId);

    boolean existsBySessionIdAndClOrdId(String sessionId, String clOrdId);
}
