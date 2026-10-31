package org.example.oms.api;

import java.time.OffsetDateTime;
import java.util.List;

import org.example.common.api.ExecutionsApi;
import org.example.common.model.query.ExecutionViewDto;
import org.example.oms.mapper.ExecutionViewDtoMapper;
import org.example.oms.service.OrderExecutionViewQueryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** Fills with the order as of each fill, from the order-execution projection (SPEC-0020). */
@RestController
@RequestMapping("/api/query")
@RequiredArgsConstructor
public class ExecutionViewController implements ExecutionsApi {

    private static final int DEFAULT_LIMIT = 1000;

    private final OrderExecutionViewQueryService queryService;
    private final ExecutionViewDtoMapper mapper;

    @Override
    public ResponseEntity<List<ExecutionViewDto>> getExecutions(
            String orderId,
            String rootOrderId,
            String account,
            OffsetDateTime transactTimeFrom,
            OffsetDateTime transactTimeTo,
            Integer limit) {
        return ResponseEntity.ok(mapper.toExecutionViewDtos(queryService.find(
                orderId,
                rootOrderId,
                account,
                transactTimeFrom != null ? transactTimeFrom.toInstant() : null,
                transactTimeTo != null ? transactTimeTo.toInstant() : null,
                limit != null ? limit : DEFAULT_LIMIT)));
    }
}
