package org.example.oms.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.example.oms.model.OrderExecutionView;
import org.example.oms.repository.OrderExecutionViewRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;

/**
 * Reads the order-execution projection for the query API (SPEC-0020). Filters combine with AND;
 * results are oldest first by transactTime, then by storage order.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrderExecutionViewQueryService {

    private final OrderExecutionViewRepository repository;

    public List<OrderExecutionView> find(
            String orderId, String rootOrderId, String account, Instant from, Instant to, int limit) {
        Specification<OrderExecutionView> filters = (root, query, cb) -> {
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
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        Sort oldestFirst = Sort.by(Sort.Order.asc("transactTime"), Sort.Order.asc("id"));
        return repository.findAll(filters, PageRequest.of(0, limit, oldestFirst)).getContent();
    }
}
