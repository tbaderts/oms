package org.example.oms.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.example.oms.model.OrderExecutionProjectionRow;
import org.example.oms.repository.OrderExecutionProjectionRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;

/**
 * Reads the order-execution projection for the query API (SPEC-0020). Filters combine with AND;
 * results are oldest first by transactTime (projection time for fills without one), then by storage
 * order. The time filters apply to transactTime only.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrderExecutionProjectionQueryService {

    private final OrderExecutionProjectionRepository repository;

    public List<OrderExecutionProjectionRow> find(
            String orderId, String rootOrderId, String account, Instant from, Instant to, int limit) {
        Specification<OrderExecutionProjectionRow> filters = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (orderId != null) {
                predicates.add(cb.equal(root.get("orderId"), orderId));
            }
            if (rootOrderId != null) {
                predicates.add(cb.equal(root.get("rootOrderId"), rootOrderId));
            }
            if (account != null) {
                predicates.add(cb.equal(root.get("account"), account));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("transactTime"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThan(root.get("transactTime"), to));
            }
            // Oldest first; a fill without transactTime sorts by when it was projected. Not on the
            // count query that paging also runs, where an ORDER BY does not belong.
            if (!Long.class.equals(query.getResultType())) {
                query.orderBy(
                        cb.asc(cb.coalesce(root.<Instant>get("transactTime"), root.<Instant>get("projectedAt"))),
                        cb.asc(root.get("id")));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        return repository.findAll(filters, PageRequest.of(0, limit)).getContent();
    }
}
