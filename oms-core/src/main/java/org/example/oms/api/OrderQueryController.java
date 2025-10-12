package org.example.oms.api;

import java.util.Map;
import java.util.stream.Collectors;

import org.example.common.model.Order;
import org.example.oms.api.dto.OrderDto;
import org.example.oms.api.mapper.OrderDtoMapper;
import org.example.oms.service.infra.query.OrderQueryService;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;

@RestController
@RequestMapping("/api/query/orders")
@Transactional(readOnly = true)
public class OrderQueryController {

    private final OrderQueryService service;
    private final OrderDtoMapper mapper;

    public OrderQueryController(OrderQueryService service, OrderDtoMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    @GetMapping
    @Operation(
            summary = "Dynamic search for Orders",
            description =
                    "Supports operations via query params: field=value (eq), field__like=txt,"
                            + " field__gt=, __gte, __lt, __lte, __between=a,b. Pagination params:"
                            + " page,size. Sort param format: sort=field,DESC;otherField,ASC")
    public ResponseEntity<Page<OrderDto>> search(
            @RequestParam Map<String, String> allParams,
            @RequestParam(name = "page", required = false) Integer page,
            @RequestParam(name = "size", required = false) Integer size,
            @RequestParam(name = "sort", required = false) String sort) {

        // Remove control params so they are not interpreted as filters
        Map<String, String> filterParams =
                allParams.entrySet().stream()
                        .filter(
                                e ->
                                        !e.getKey().equals("page")
                                                && !e.getKey().equals("size")
                                                && !e.getKey().equals("sort"))
                        .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        Page<Order> result = service.search(filterParams, page, size, sort);
        Page<OrderDto> dtoPage = result.map(mapper::toDto);
        return ResponseEntity.ok(dtoPage);
    }
}
