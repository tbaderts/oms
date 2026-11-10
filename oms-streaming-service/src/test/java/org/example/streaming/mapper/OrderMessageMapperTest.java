package org.example.streaming.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import org.example.common.model.msg.OrderMessage;
import org.example.streaming.model.OrderDto;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class OrderMessageMapperTest {

    private final OrderMessageMapper mapper = new OrderMessageMapper();

    /**
     * The default columns of the orders blotter, as oms-core's Order metamodel lists them. Live mode
     * shows the same default columns as History mode only if the stream fills each (SPEC-0056 AC-5).
     */
    private static final List<String> BLOTTER_DEFAULT_COLUMNS = List.of(
            "orderId", "clOrdId", "side", "orderQty", "ordType", "price", "symbol", "state", "timeInForce",
            "securityId", "transactTime");

    @Test
    void orderDtoCarriesAllBlotterDefaultColumns() {
        OrderMessage message = new OrderMessage();
        message.setOrderId("ORD-1");
        message.setClOrdId("CL-1");
        message.setSide(org.example.common.model.msg.Side.BUY);
        message.setOrderQty(new BigDecimal("100.00000000"));
        message.setOrdType(org.example.common.model.msg.OrdType.LIMIT);
        message.setPrice(new BigDecimal("170.00000000"));
        message.setSymbol("AAPL");
        message.setState(org.example.common.model.msg.State.LIVE);
        message.setTimeInForce(org.example.common.model.msg.TimeInForce.DAY);
        message.setSecurityId("US0378331005");
        message.setTransactTime(Instant.parse("2026-11-09T10:00:00Z"));

        JsonNode json = JsonMapper.builder().build().valueToTree(mapper.toOrderDto(message));

        for (String column : BLOTTER_DEFAULT_COLUMNS) {
            assertTrue(json.hasNonNull(column), column + " missing from " + json);
        }
    }

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
