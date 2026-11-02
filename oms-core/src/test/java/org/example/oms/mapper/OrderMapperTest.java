package org.example.oms.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.Order;
import org.example.common.model.msg.Side;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

/**
 * SPEC-0039: an order received over Kafka is mapped to the command model explicitly. Jackson's
 * convertValue fails on Avro records, so creating an order over Kafka had never worked.
 */
class OrderMapperTest {

    private final OrderMapper mapper = Mappers.getMapper(OrderMapper.class);

    @Test
    void toCmdOrder_mapsDecimalsAndIsoTimes() {
        Order message = Order.newBuilder()
                .setClOrdId("CL-1")
                .setSessionId("S-1")
                .setAccount("ACCT-1")
                .setSymbol("AAPL")
                .setSide(Side.BUY)
                .setOrdType(OrdType.LIMIT)
                .setPrice(new BigDecimal("170.12345678"))
                .setOrderQty(new BigDecimal("100.12345678"))
                .setStopPx(new BigDecimal("0.00000001"))
                .setSendingTime("2026-11-01T09:30:00.123Z")
                .setExpireTime(null)
                .build();

        var cmd = mapper.toCmdOrder(message);

        assertEquals("CL-1", cmd.getClOrdId());
        assertEquals("S-1", cmd.getSessionId());
        assertEquals("BUY", cmd.getSide().name());
        assertEquals("LIMIT", cmd.getOrdType().name());
        assertEquals(0, new BigDecimal("170.12345678").compareTo(cmd.getPrice()));
        assertEquals(0, new BigDecimal("100.12345678").compareTo(cmd.getOrderQty()));
        assertEquals(0, new BigDecimal("0.00000001").compareTo(cmd.getStopPx()));
        assertEquals(OffsetDateTime.parse("2026-11-01T09:30:00.123Z"), cmd.getSendingTime());
        assertNull(cmd.getExpireTime());
    }
}
