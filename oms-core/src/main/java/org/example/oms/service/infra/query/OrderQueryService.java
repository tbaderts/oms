package org.example.oms.service.infra.query;

import java.util.Map;

import org.example.common.model.Order;
import org.example.oms.service.infra.repository.OrderRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

@Service
@Transactional(readOnly = true)
@Slf4j
public class OrderQueryService {

    private final OrderRepository repository;

    public OrderQueryService(OrderRepository repository) {
        this.repository = repository;
    }

    public Page<Order> search(Map<String, String> params, Integer page, Integer size, String sort) {
        log.info(
                "Searching orders with params: {}, page: {}, size: {}, sort: {}",
                params,
                page,
                size,
                sort);
        Pageable pageable = buildPageable(page, size, sort);
        Specification<Order> spec = OrderSpecifications.dynamic(params);
        return repository.findAll(spec, pageable);
    }

    private Pageable buildPageable(Integer page, Integer size, String sort) {
        int p = page != null && page >= 0 ? page : 0;
        int s = size != null && size > 0 && size <= 500 ? size : 50;
        if (sort == null || sort.isBlank()) {
            return PageRequest.of(p, s, Sort.by(Sort.Direction.DESC, "id"));
        }
        // format: field[,ASC|DESC];field2[,DESC]
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
