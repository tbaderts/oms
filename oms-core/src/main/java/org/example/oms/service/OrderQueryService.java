package org.example.oms.service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.example.common.model.Order;
import org.example.oms.repository.OrderEventRepository;
import org.example.oms.repository.OrderEventRepository.OrderVersion;
import org.example.oms.repository.OrderRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
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
    private final OrderEventRepository orderEventRepository;

    /**
     * Searches orders and reads each one's latest event-log version.
     *
     * <p>REPEATABLE_READ runs both queries against one Postgres snapshot. An order row and its event
     * are committed together, so the version always belongs to the state on the page; otherwise a
     * streaming subscriber could pair a newer version with an older state and drop the live event
     * that carries the newer state.
     */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
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
        List<String> orderIds = orders.getContent().stream().map(Order::getOrderId).toList();
        Map<String, Long> eventVersions =
                orderIds.isEmpty()
                        ? Map.of()
                        : orderEventRepository.findLatestVersions(orderIds).stream()
                                .collect(Collectors.toMap(
                                        OrderVersion::getOrderId, OrderVersion::getVersion));
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
