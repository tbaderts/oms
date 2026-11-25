package org.example.oms.service;

import java.util.Map;
import org.example.common.model.Execution;
import org.example.oms.repository.ExecutionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * The execution search over stored fills (SPEC-0070): {@link ExecutionSpecifications} filters,
 * paging and sorting as in {@link OrderQueryService}. Newest stored fill first by default; a sort
 * field an execution does not have is refused, not passed to the database.
 *
 * @see <a href="file:///oms-knowledge-base/framework/query-engine.md">Query Engine</a>
 */
@Service
@Transactional(readOnly = true)
@Slf4j
@RequiredArgsConstructor
public class ExecutionQueryService {

    static final int DEFAULT_SIZE = 50;

    private final ExecutionRepository repository;

    public Page<Execution> search(Map<String, String> filters, Integer page, Integer size, String sort) {
        log.info("Searching executions with filters: {}, page: {}, size: {}, sort: {}", filters, page, size, sort);
        return repository.findAll(ExecutionSpecifications.dynamic(filters), pageable(page, size, sort));
    }

    private static Pageable pageable(Integer page, Integer size, String sort) {
        // page and size bounds are checked by the generated interface (400 when outside them)
        int p = page != null ? page : 0;
        int s = size != null ? size : DEFAULT_SIZE;
        return PageRequest.of(p, s, sortOf(sort));
    }

    /** {@code field[,ASC|DESC];…}, then {@code id,DESC} as the tie-breaker; {@code id,DESC} when empty. */
    static Sort sortOf(String sort) {
        Sort result = Sort.unsorted();
        if (sort != null) {
            for (String part : sort.split(";")) {
                if (part.isBlank()) {
                    continue;
                }
                String[] seg = part.split(",");
                String field = seg[0].trim();
                if (!"id".equals(field) && !ExecutionSpecifications.FILTERABLE.containsKey(field)) {
                    throw new IllegalArgumentException("Cannot sort executions by " + field);
                }
                Sort.Direction direction = seg.length > 1
                        ? Sort.Direction.fromOptionalString(seg[1].trim().toUpperCase()).orElse(Sort.Direction.ASC)
                        : Sort.Direction.ASC;
                result = result.and(Sort.by(direction, field));
            }
        }
        if (result.isUnsorted()) {
            return Sort.by(Sort.Direction.DESC, "id");
        }
        // Ties on the chosen fields would let pages repeat or skip fills; the storage id breaks them.
        return result.getOrderFor("id") != null ? result : result.and(Sort.by(Sort.Direction.DESC, "id"));
    }
}
