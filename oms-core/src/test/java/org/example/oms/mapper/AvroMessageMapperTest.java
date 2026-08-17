package org.example.oms.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.Instant;

import org.apache.avro.io.DatumReader;
import org.apache.avro.io.DatumWriter;
import org.apache.avro.io.DecoderFactory;
import org.apache.avro.io.EncoderFactory;
import org.apache.avro.specific.SpecificDatumReader;
import org.apache.avro.specific.SpecificDatumWriter;
import org.example.common.model.Execution;
import org.example.common.model.OrdType;
import org.example.common.model.Order;
import org.example.common.model.Side;
import org.example.common.model.State;
import org.example.common.model.msg.OrderMessage;
import org.junit.jupiter.api.Test;

/**
 * Round-trips the published messages through actual Avro encoding.
 *
 * <p>Mapper unit tests that stop at the builder would not have caught either bug these cover: a
 * field missing from the schema simply never appears, and a decimal whose scale exceeds the
 * contract's only fails when it is encoded.
 */
class AvroMessageMapperTest {

    private final OrderMessageMapper orderMessageMapper = new OrderMessageMapper();
    private final ExecutionMessageMapper executionMessageMapper = new ExecutionMessageMapper();

    @Test
    void orderMessage_carriesFillProgressThroughEncoding() throws Exception {
        Order order =
                Order.builder()
                        .orderId("ORD-1")
                        .rootOrderId("ORD-1")
                        .symbol("AAPL")
                        .side(Side.BUY)
                        .ordType(OrdType.LIMIT)
                        .state(State.LIVE)
                        .orderQty(new BigDecimal("10.00"))
                        .cumQty(new BigDecimal("4.0000"))
                        .leavesQty(new BigDecimal("6.0000"))
                        .build();

        OrderMessage decoded = roundTrip(orderMessageMapper.toOrderMessage(order, 3L));

        assertEquals(0, new BigDecimal("4.0000").compareTo(decoded.getCumQty()));
        assertEquals(0, new BigDecimal("6.0000").compareTo(decoded.getLeavesQty()));
        assertEquals(3L, decoded.getEventId());
        assertEquals("LIVE", decoded.getState().name());
    }

    @Test
    void executionMessage_carriesTheFillAndTheResultingPosition() throws Exception {
        Instant transactTime = Instant.parse("2026-08-17T09:30:00Z");
        Execution execution =
                Execution.builder()
                        .execID("EX-1")
                        .orderId("ORD-1")
                        .lastQty(new BigDecimal("4.0000"))
                        .lastPx(new BigDecimal("101.2500"))
                        .cumQty(new BigDecimal("4.0000"))
                        .leavesQty(new BigDecimal("6.0000"))
                        .execType("F")
                        .lastMkt("XNAS")
                        .transactTime(transactTime)
                        .build();

        var decoded = roundTrip(executionMessageMapper.toExecutionMessage(execution));

        assertEquals("EX-1", decoded.getExecId());
        assertEquals("ORD-1", decoded.getOrderId());
        assertEquals(0, new BigDecimal("4.0000").compareTo(decoded.getLastQty()));
        assertEquals(0, new BigDecimal("101.2500").compareTo(decoded.getLastPx()));
        assertEquals(0, new BigDecimal("4.0000").compareTo(decoded.getCumQty()));
        assertEquals(0, new BigDecimal("6.0000").compareTo(decoded.getLeavesQty()));
        assertEquals("F", decoded.getExecType());
        assertEquals("XNAS", decoded.getLastMkt());
        assertEquals(transactTime, decoded.getTransactTime());

        // avgPx is declared on the contract but oms-core does not compute it yet.
        assertNull(decoded.getAvgPx());
    }

    /**
     * Fractional quantities are the reason the new fields are declared at scale 4: the OMS targets
     * FX and digital assets, where a fill of 0.1234 is ordinary. At the scale 2 used by the older
     * fields this throws rather than rounding.
     */
    @Test
    void fractionalQuantities_surviveEncodingAtTheContractScale() throws Exception {
        Order order =
                Order.builder()
                        .orderId("ORD-FX")
                        .rootOrderId("ORD-FX")
                        .cumQty(new BigDecimal("0.1234"))
                        .leavesQty(new BigDecimal("0.8766"))
                        .build();

        OrderMessage decoded = roundTrip(orderMessageMapper.toOrderMessage(order, 1L));

        assertEquals(0, new BigDecimal("0.1234").compareTo(decoded.getCumQty()));
        assertEquals(0, new BigDecimal("0.8766").compareTo(decoded.getLeavesQty()));
    }

    @Test
    void unfilledOrder_encodesNullQuantitiesRatherThanFailing() throws Exception {
        Order order = Order.builder().orderId("ORD-NEW").rootOrderId("ORD-NEW").build();

        OrderMessage decoded = roundTrip(orderMessageMapper.toOrderMessage(order, 1L));

        assertNotNull(decoded);
        assertNull(decoded.getCumQty());
        assertNull(decoded.getLeavesQty());
    }

    @SuppressWarnings("unchecked")
    private <T extends org.apache.avro.specific.SpecificRecord> T roundTrip(T record)
            throws Exception {
        DatumWriter<T> writer = new SpecificDatumWriter<>(record.getSchema());
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        var encoder = EncoderFactory.get().binaryEncoder(out, null);
        writer.write(record, encoder);
        encoder.flush();

        DatumReader<T> reader = new SpecificDatumReader<>(record.getSchema());
        return reader.read(
                null, DecoderFactory.get().binaryDecoder(out.toByteArray(), null));
    }
}
