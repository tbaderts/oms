package org.example.streaming.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.example.common.model.msg.OrderMessage;
import org.example.streaming.model.OrderDto;
import org.junit.jupiter.api.Test;

class OrderMessageMapperTest {

    private final OrderMessageMapper mapper = new OrderMessageMapper();

    @Test
    void mapsRejectReason() {
        OrderMessage message = new OrderMessage();
        message.setOrderId("ORD-1");
        message.setText("Sample order");
        message.setRejectReason("Unknown symbol ZZZZ");

        OrderDto dto = mapper.toOrderDto(message);

        assertEquals("Unknown symbol ZZZZ", dto.getRejectReason());
        assertEquals("Sample order", dto.getText());
    }
}
