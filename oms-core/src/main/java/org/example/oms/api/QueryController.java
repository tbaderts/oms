package org.example.oms.api;

import java.util.Map;
import java.util.stream.Collectors;

import org.example.common.api.SearchApi;
import org.example.common.model.Order;
import org.example.common.model.query.PagedOrderDto;
import org.example.oms.api.mapper.QueryOrderDtoMapper;
import org.example.oms.config.UseReadReplica;
import org.example.oms.service.infra.query.OrderQueryService;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.Nullable;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/query")
@Transactional(readOnly = true)
@UseReadReplica
public class QueryController implements SearchApi {

    private final OrderQueryService service;
    private final QueryOrderDtoMapper mapper;

    @Override
    public ResponseEntity<PagedOrderDto> searchOrders(
            @Nullable Integer page,
            @Nullable Integer size,
            @Nullable String sort,
            @Nullable Map<String, String> allParams) {

        // Remove control params so they are not interpreted as filters
        Map<String, String> filterParams = allParams == null
                ? Map.of()
                : allParams.entrySet().stream()
                        .filter(
                                e -> !e.getKey().equals("page")
                                        && !e.getKey().equals("size")
                                        && !e.getKey().equals("sort"))
                        .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        Page<Order> result = service.search(filterParams, page, size, sort);
        PagedOrderDto pagedDto = mapper.toPagedOrderDto(result);
        return ResponseEntity.ok(pagedDto);
    }
}
