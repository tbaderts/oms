package org.example.oms.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.query.OrderEventDto;
import org.example.common.model.query.OrderEventType;
import org.example.oms.model.Event;
import org.example.oms.model.OrderEvent;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

import tools.jackson.databind.json.JsonMapper;

/**
 * SPEC-0035: the contracted event-log entry carries every field of the stored event except the
 * database id, and the contract's event kinds are exactly oms-core's.
 */
class OrderEventDtoMapperTest {

    private final OrderEventDtoMapper mapper =
            new OrderEventDtoMapperImpl(
                    Mappers.getMapper(QueryOrderDtoMapper.class),
                    new CommandJsonConverter(JsonMapper.builder().build()));

    @Test
    void eventKindsMatchContract() {
        assertEquals(
                Arrays.stream(Event.values()).map(Enum::name).toList(),
                Arrays.stream(OrderEventType.values()).map(Enum::name).toList());
    }

    @Test
    void mapsEveryField() {
        Instant recorded = Instant.parse("2026-10-31T09:30:00Z");
        OrderAcceptCmd command = new OrderAcceptCmd("ORD-1", "OrderAcceptCmd");
        OrderEvent event = OrderEvent.builder()
                .id(99L)
                .orderId("ORD-1")
                .version(2)
                .event(Event.ACK)
                .transaction(command)
                .commandId("CMD-2")
                .resultingState(State.LIVE)
                .orderSnapshot(Order.builder().orderId("ORD-1").state(State.LIVE).txNr(2).build())
                .timeStamp(recorded)
                .build();

        List<OrderEventDto> dtos = mapper.toOrderEventDtos(List.of(event));

        assertEquals(1, dtos.size());
        OrderEventDto dto = dtos.get(0);
        assertEquals("ORD-1", dto.getOrderId());
        assertEquals(2L, dto.getVersion());
        assertEquals(OrderEventType.ACK, dto.getEvent());
        assertEquals("CMD-2", dto.getCommandId());
        assertEquals(org.example.common.model.query.State.LIVE, dto.getResultingState());
        assertEquals(recorded.atOffset(ZoneOffset.UTC), dto.getTimeStamp());
        Map<?, ?> transaction = (Map<?, ?>) dto.getTransaction();
        assertEquals("OrderAcceptCmd", transaction.get("type"));
        assertEquals("ORD-1", transaction.get("orderId"));
        assertEquals("ORD-1", dto.getOrderSnapshot().getOrderId());
        assertEquals(org.example.common.model.query.State.LIVE, dto.getOrderSnapshot().getState());
        assertEquals(2L, dto.getOrderSnapshot().getTxNr());
    }
}
