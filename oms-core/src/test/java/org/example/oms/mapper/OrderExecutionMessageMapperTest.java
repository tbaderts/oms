package org.example.oms.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import org.apache.avro.io.DecoderFactory;
import org.apache.avro.io.EncoderFactory;
import org.apache.avro.specific.SpecificDatumReader;
import org.apache.avro.specific.SpecificDatumWriter;
import org.example.common.model.Execution;
import org.example.common.model.Leg;
import org.example.common.model.OrdType;
import org.example.common.model.Order;
import org.example.common.model.Side;
import org.example.common.model.State;
import org.example.common.model.msg.OrderExecution;
import org.junit.jupiter.api.Test;

/**
 * SPEC-0019: the OrderExecution record carries the fill and the order as of that fill, and survives
 * real Avro encoding (decimal scale, logical types).
 */
class OrderExecutionMessageMapperTest {

    private static final Instant STAGED_AT = Instant.parse("2026-10-31T09:00:00Z");

    private final OrderExecutionMessageMapper mapper = new OrderExecutionMessageMapper();

    @Test
    void carriesFillOrderContextVersionAndTradeDate() throws Exception {
        Order order = order().rootOrderId("ROOT-1").parentOrderId("ROOT-1").build();
        Execution execution = execution(Instant.parse("2026-10-30T23:30:00Z"));

        OrderExecution decoded = roundTrip(mapper.toOrderExecutionMessage(execution, order, 7L, STAGED_AT));

        assertEquals("EX-1", decoded.getExecId());
        assertEquals(0, new BigDecimal("40").compareTo(decoded.getLastQty()));
        assertEquals(0, new BigDecimal("101.5").compareTo(decoded.getLastPx()));
        assertEquals("TRADE", decoded.getExecType());
        assertEquals("XNAS", decoded.getLastMkt());
        assertEquals("AGENCY", decoded.getLastCapacity());
        assertEquals(Instant.parse("2026-10-30T23:30:00Z"), decoded.getTransactTime());
        assertEquals("ORD-1", decoded.getOrderId());
        assertEquals("ROOT-1", decoded.getRootOrderId());
        assertEquals("ROOT-1", decoded.getParentOrderId());
        assertEquals("CLI", decoded.getLeg());
        assertEquals("CL-1", decoded.getClOrdId());
        assertEquals("S-1", decoded.getSessionId());
        assertEquals("ACCT-1", decoded.getAccount());
        assertEquals("BUY", decoded.getSide().name());
        assertEquals("AAPL", decoded.getSymbol());
        assertEquals("US0378331005", decoded.getSecurityId());
        assertEquals("LIMIT", decoded.getOrdType().name());
        assertEquals(0, new BigDecimal("102").compareTo(decoded.getPrice()));
        assertEquals(0, new BigDecimal("100").compareTo(decoded.getOrderQty()));
        assertEquals("USD", decoded.getSettlCurrency());
        assertEquals("XNAS", decoded.getExDestination());
        assertEquals(0, new BigDecimal("40").compareTo(decoded.getCumQty()));
        assertEquals(0, new BigDecimal("60").compareTo(decoded.getLeavesQty()));
        assertNull(decoded.getAvgPx());
        assertEquals("LIVE", decoded.getState().name());
        assertEquals(7L, decoded.getOrderVersion());
        // UTC date of transactTime, not of the staging time.
        assertEquals(LocalDate.of(2026, 10, 30), decoded.getTradeDate());
    }

    @Test
    void rootOrderIdFallsBackToOrderIdAndTradeDateToStagingTime() throws Exception {
        OrderExecution decoded =
                roundTrip(mapper.toOrderExecutionMessage(execution(null), order().build(), 2L, STAGED_AT));

        assertEquals("ORD-1", decoded.getRootOrderId());
        assertNull(decoded.getParentOrderId());
        assertEquals(LocalDate.of(2026, 10, 31), decoded.getTradeDate());
    }

    private static Order.OrderBuilder<?, ?> order() {
        return Order.builder()
                .orderId("ORD-1")
                .leg(Leg.CLI)
                .clOrdId("CL-1")
                .sessionId("S-1")
                .account("ACCT-1")
                .side(Side.BUY)
                .symbol("AAPL")
                .securityId("US0378331005")
                .ordType(OrdType.LIMIT)
                .price(new BigDecimal("102.00"))
                .orderQty(new BigDecimal("100.0000"))
                .settlCurrency("USD")
                .exDestination("XNAS")
                .cumQty(new BigDecimal("40.0000"))
                .leavesQty(new BigDecimal("60.0000"))
                .state(State.LIVE);
    }

    private static Execution execution(Instant transactTime) {
        return Execution.builder()
                .orderId("ORD-1")
                .execID("EX-1")
                .lastQty(new BigDecimal("40.0000"))
                .lastPx(new BigDecimal("101.5000"))
                .cumQty(new BigDecimal("40.0000"))
                .leavesQty(new BigDecimal("60.0000"))
                .execType("TRADE")
                .lastMkt("XNAS")
                .lastCapacity("AGENCY")
                .transactTime(transactTime)
                .build();
    }

    private static OrderExecution roundTrip(OrderExecution message) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        var encoder = EncoderFactory.get().binaryEncoder(out, null);
        new SpecificDatumWriter<>(OrderExecution.class).write(message, encoder);
        encoder.flush();
        var decoder = DecoderFactory.get().binaryDecoder(out.toByteArray(), null);
        return new SpecificDatumReader<>(OrderExecution.class).read(null, decoder);
    }
}
