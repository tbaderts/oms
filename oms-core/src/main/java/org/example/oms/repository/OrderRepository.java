package org.example.oms.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.TimeInForce;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

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

    /** Orders currently in this state, for the orders-by-state gauge (SPEC-0038). */
    long countByState(State state);

    /** Open orders with this time in force whose expiry time has passed (SPEC-0029, GTD expiry). */
    @Query("select o.orderId from Order o where o.state in :states and o.timeInForce = :timeInForce "
            + "and o.expireTime <= :now order by o.id")
    List<String> findIdsToExpire(Collection<State> states, TimeInForce timeInForce, Instant now);

    /**
     * DAY orders in these states (SPEC-0029, expiry at end of day). An order without a time in force
     * is a DAY order, the FIX default for tag 59.
     */
    @Query("select o.orderId from Order o where o.state in :states "
            + "and (o.timeInForce = org.example.common.model.TimeInForce.DAY or o.timeInForce is null) order by o.id")
    List<String> findDayOrderIds(Collection<State> states);

    /**
     * Orders in these states with no event at or after the cutoff: finished before it (SPEC-0029,
     * the end-of-day close).
     */
    @Query("select o.orderId from Order o where o.state in :states and not exists "
            + "(select e.id from OrderEvent e where e.orderId = o.orderId and e.timeStamp >= :cutoff) order by o.id")
    List<String> findIdsUnchangedSince(Collection<State> states, Instant cutoff);
}
