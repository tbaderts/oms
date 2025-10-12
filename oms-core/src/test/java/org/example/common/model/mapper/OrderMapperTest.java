package org.example.common.model.mapper;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import org.example.common.model.Order;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

class OrderMapperTest {
    private final OrderMapper mapper = Mappers.getMapper(OrderMapper.class);

    @Test
    void testToOrderAndBack() {
        org.example.common.model.cmd.Order cmdOrder =
                org.example.common.model.cmd.Order.builder()
                        .orderId("OID123")
                        .orderQty(new BigDecimal("100.5"))
                        .sendingTime(OffsetDateTime.now())
                        .expireTime(OffsetDateTime.now().plusDays(1))
                        // ... set other fields as needed ...
                        .build();

        Order order = mapper.toOrder(cmdOrder);
        assertEquals(cmdOrder.getOrderId(), order.getOrderId());
        assertEquals(cmdOrder.getOrderQty(), order.getOrderQty());
        assertNotNull(order.getSendingTime());
        assertNotNull(order.getExpireTime());

        org.example.common.model.cmd.Order mappedBack = mapper.toCmdOrder(order);
        assertEquals(order.getOrderId(), mappedBack.getOrderId());
        assertEquals(order.getOrderQty(), mappedBack.getOrderQty());
        assertNotNull(mappedBack.getSendingTime());
        assertNotNull(mappedBack.getExpireTime());
    }
}
