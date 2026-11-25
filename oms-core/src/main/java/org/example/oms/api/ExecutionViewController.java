package org.example.oms.api;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.example.common.api.ExecutionsApi;
import org.example.common.model.query.ExecutionViewDto;
import org.example.common.model.query.PagedExecutionDto;
import org.example.oms.mapper.ExecutionViewDtoMapper;
import org.example.oms.mapper.QueryExecutionDtoMapper;
import org.example.oms.service.ExecutionOrder;
import org.example.oms.service.ExecutionQueryService;
import org.example.oms.service.OrderExecutionProjectionQueryService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

/**
 * The two execution reads of the query API, which the generator puts in one interface:
 * <ul>
 *   <li>{@code /executions}: fills with the order as of each fill, from the order-execution
 *       projection, for booking and downstream systems (SPEC-0020);
 *   <li>{@code /executions/search}: stored fills, searched like orders (SPEC-0070).
 * </ul>
 */
@RestController
@RequestMapping("/api/query")
@RequiredArgsConstructor
public class ExecutionViewController implements ExecutionsApi {

    private static final int DEFAULT_LIMIT = 1000;
    private static final Set<String> CONTROL_PARAMS = Set.of("page", "size", "sort");

    private final OrderExecutionProjectionQueryService queryService;
    private final ExecutionViewDtoMapper mapper;
    private final ExecutionQueryService executionQueryService;
    private final QueryExecutionDtoMapper executionMapper;
    private final ObjectProvider<HttpServletRequest> requestProvider;

    @Override
    public ResponseEntity<List<ExecutionViewDto>> getExecutions(
            String orderId,
            String rootOrderId,
            String account,
            OffsetDateTime transactTimeFrom,
            OffsetDateTime transactTimeTo,
            Integer limit,
            String order) {
        return ResponseEntity.ok(mapper.toExecutionViewDtos(queryService.find(
                orderId,
                rootOrderId,
                account,
                transactTimeFrom != null ? transactTimeFrom.toInstant() : null,
                transactTimeTo != null ? transactTimeTo.toInstant() : null,
                limit != null ? limit : DEFAULT_LIMIT,
                ExecutionOrder.of(order))));
    }

    /** Every query parameter except page, size and sort is a filter, as in the order search. */
    @Override
    public ResponseEntity<PagedExecutionDto> searchExecutions(Integer page, Integer size, String sort) {
        HttpServletRequest request = requestProvider.getIfAvailable();
        Map<String, String> filters = request == null
                ? Map.of()
                : request.getParameterMap().entrySet().stream()
                        .filter(e -> !CONTROL_PARAMS.contains(e.getKey()))
                        .filter(e -> e.getValue() != null && e.getValue().length > 0)
                        .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue()[0]));
        return ResponseEntity.ok(
                executionMapper.toPagedExecutionDto(executionQueryService.search(filters, page, size, sort)));
    }
}
