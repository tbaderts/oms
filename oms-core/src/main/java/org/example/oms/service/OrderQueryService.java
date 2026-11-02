package org.example.oms.service;

import java.util.Map;
import java.util.stream.Collectors;

import org.example.common.model.Order;
import org.example.oms.repository.OrderRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Service for querying orders using dynamic filters and pagination. Leverages Spring Data JPA
 * Specification pattern for flexible query construction.
 *
 * @see <a href="file:///oms-knowledge-base/oms-framework/state-query-store_spec.md">State Query Store - JPA Specification Pattern</a>
 * @see <a href="file:///oms-knowledge-base/oms-framework/domain-model_spec.md">Domain Model - Order Entity</a>
 */
@Service
@Transactional(readOnly = true)
@Slf4j
@RequiredArgsConstructor
public class OrderQueryService {

    private final OrderRepository repository;

    /**
     * Searches orders, each with its latest event-log version.
     *
     * <p>The version is the order row's own (SPEC-0027): the appender sets it with the event, in one
     * transaction, so it always belongs to the state on the page. A streaming subscriber therefore
     * never pairs a newer version with an older state and drops the live event that carries the
     * newer state.
     */
    @Transactional(readOnly = true)
    public OrderSearchResult search(Map<String, String> params, Integer page, Integer size, String sort) {
        log.info(
                "Searching orders with params: {}, page: {}, size: {}, sort: {}",
                params,
                page,
                size,
                sort);
        Pageable pageable = buildPageable(page, size, sort);
        Specification<Order> spec = OrderSpecifications.dynamic(params);
        Page<Order> orders = repository.findAll(spec, pageable);
        // An order without events (version 0) has no eventVersion, as before.
        Map<String, Long> eventVersions =
                orders.getContent().stream()
                        .filter(order -> order.getTxNr() > 0)
                        .collect(Collectors.toMap(Order::getOrderId, Order::getTxNr));
        return new OrderSearchResult(orders, eventVersions);
    }

    private Pageable buildPageable(Integer page, Integer size, String sort) {
        int p = page != null && page >= 0 ? page : 0;
        int s = size != null && size > 0 && size <= 500 ? size : 50;
        if (sort == null || sort.isBlank()) {
            return PageRequest.of(p, s, Sort.by(Sort.Direction.DESC, "id"));
        }
        String[] parts = sort.split(";");
        Sort finalSort = Sort.unsorted();
        for (String part : parts) {
            if (part.isBlank()) continue;
            String[] seg = part.split(",");
            String field = seg[0];
            Sort.Direction dir =
                    seg.length > 1
                            ? Sort.Direction.fromOptionalString(seg[1].toUpperCase())
                                    .orElse(Sort.Direction.ASC)
                            : Sort.Direction.ASC;
            Sort next = Sort.by(dir, field);
            finalSort = finalSort.and(next);
        }
        if (finalSort.isUnsorted()) {
            finalSort = Sort.by(Sort.Direction.DESC, "id");
        }
        return PageRequest.of(p, s, finalSort);
    }
}
