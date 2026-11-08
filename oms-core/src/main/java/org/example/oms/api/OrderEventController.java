package org.example.oms.api;

import java.util.List;

import org.example.common.api.OrdersApi;
import org.example.common.model.query.CommandLogEntryDto;
import org.example.common.model.query.OrderEventDto;
import org.example.oms.mapper.CommandLogEntryDtoMapper;
import org.example.oms.mapper.OrderEventDtoMapper;
import org.example.oms.service.CommandLogReadService;
import org.example.oms.service.OrderEventReadService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/**
 * An order's history as query API operations ({@code oms-query-api.yml}): its event log, what changed
 * (SPEC-0035), and its command log, what was asked and what became of it (SPEC-0046).
 */
@RestController
@RequestMapping("/api/query")
@RequiredArgsConstructor
public class OrderEventController implements OrdersApi {

    private final OrderEventReadService orderEventReadService;
    private final OrderEventDtoMapper orderEventDtoMapper;
    private final CommandLogReadService commandLogReadService;
    private final CommandLogEntryDtoMapper commandLogEntryDtoMapper;

    @Override
    public ResponseEntity<List<OrderEventDto>> getOrderEvents(String orderId, String execId) {
        return ResponseEntity.ok(
                orderEventDtoMapper.toOrderEventDtos(orderEventReadService.findByOrderId(orderId, execId)));
    }

    @Override
    public ResponseEntity<List<CommandLogEntryDto>> getOrderCommands(String orderId) {
        return ResponseEntity.ok(commandLogEntryDtoMapper.toDtos(commandLogReadService.findByOrderId(orderId)));
    }
}
