package org.example.oms.api;

import java.util.List;

import org.example.common.api.OrdersApi;
import org.example.common.model.query.OrderEventDto;
import org.example.oms.mapper.OrderEventDtoMapper;
import org.example.oms.service.OrderEventReadService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** The order event log as a query API operation ({@code oms-query-api.yml}, SPEC-0035). */
@RestController
@RequestMapping("/api/query")
@RequiredArgsConstructor
public class OrderEventController implements OrdersApi {

    private final OrderEventReadService orderEventReadService;
    private final OrderEventDtoMapper orderEventDtoMapper;

    @Override
    public ResponseEntity<List<OrderEventDto>> getOrderEvents(String orderId) {
        return ResponseEntity.ok(
                orderEventDtoMapper.toOrderEventDtos(orderEventReadService.findByOrderId(orderId)));
    }
}
