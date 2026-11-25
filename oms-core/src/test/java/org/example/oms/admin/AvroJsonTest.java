package org.example.oms.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.time.Instant;
import java.time.LocalDate;

import org.apache.avro.Conversions;
import org.apache.avro.LogicalTypes;
import org.apache.avro.Schema;
import org.apache.avro.SchemaBuilder;
import org.apache.avro.generic.GenericData;
import org.apache.avro.generic.GenericRecord;
import org.apache.avro.util.Utf8;
import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/**
 * SPEC-0075: Avro records (specific, or generic from the registry) as JSON an operator can read:
 * decimals as numbers, timestamps and dates as ISO text, enums by name.
 */
class AvroJsonTest {

    @Test
    void specificRecordWithLogicalTypes() {
        OrderExecution record = OrderExecution.newBuilder()
                .setExecId("EX-1")
                .setLastQty(new BigDecimal("6.5536"))
                .setLastPx(new BigDecimal("101.5000"))
                .setExecType("F")
                .setLastCapacity(null)
                .setLastMkt("XNAS")
                .setTransactTime(Instant.parse("2026-10-30T23:30:00Z"))
                .setOrderId("ORD-1")
                .setRootOrderId("ROOT-1")
                .setParentOrderId("ROOT-1")
                .setLeg("CLI")
                .setClOrdId("CL-1")
                .setSessionId("S-1")
                .setAccount("ACCT-1")
                .setSide(Side.BUY)
                .setSymbol("AAPL")
                .setSecurityId(null)
                .setOrdType(OrdType.LIMIT)
                .setPrice(new BigDecimal("102.0000"))
                .setOrderQty(new BigDecimal("100.0000"))
                .setSettlCurrency("USD")
                .setExDestination("XNAS")
                .setCumQty(new BigDecimal("40.1234"))
                .setLeavesQty(new BigDecimal("59.8766"))
                .setAvgPx(null)
                .setState(State.LIVE)
                .setOrderVersion(7L)
                .setTradeDate(LocalDate.of(2026, 10, 30))
                .build();

        JsonNode json = AvroJson.toJson(record);

        assertEquals("EX-1", json.get("execId").asString());
        assertTrue(json.get("lastQty").isNumber());
        assertEquals(new BigDecimal("6.5536"), json.get("lastQty").decimalValue());
        assertEquals("2026-10-30T23:30:00Z", json.get("transactTime").asString());
        assertEquals("2026-10-30", json.get("tradeDate").asString());
        assertEquals("BUY", json.get("side").asString());
        assertEquals("LIVE", json.get("state").asString());
        assertEquals(7L, json.get("orderVersion").asLong());
        assertTrue(json.get("avgPx").isNull());
    }

    @Test
    void genericRecordFromTheRegistryWithRawLogicalValues() {
        Schema decimal = LogicalTypes.decimal(18, 4).addToSchema(Schema.create(Schema.Type.BYTES));
        Schema millis = LogicalTypes.timestampMillis().addToSchema(Schema.create(Schema.Type.LONG));
        Schema nested = SchemaBuilder.record("Header").fields().requiredString("id").endRecord();
        Schema schema = SchemaBuilder.record("FutureCmd").namespace("org.example")
                .fields()
                .name("price").type(decimal).noDefault()
                .name("at").type(millis).noDefault()
                .name("header").type(nested).noDefault()
                .name("tags").type().array().items().stringType().noDefault()
                .name("blob").type().bytesType().noDefault()
                .endRecord();
        GenericRecord header = new GenericData.Record(nested);
        header.put("id", new Utf8("H-1"));
        GenericRecord record = new GenericData.Record(schema);
        record.put("price", new Conversions.DecimalConversion().toBytes(new BigDecimal("170.5000"), decimal, decimal.getLogicalType()));
        record.put("at", Instant.parse("2026-11-25T09:00:00Z").toEpochMilli());
        record.put("header", header);
        record.put("tags", java.util.List.of(new Utf8("a"), new Utf8("b")));
        record.put("blob", ByteBuffer.wrap(new byte[] {(byte) 0xca, (byte) 0xfe}));

        JsonNode json = AvroJson.toJson(record);

        assertEquals(new BigDecimal("170.5000"), json.get("price").decimalValue());
        assertEquals("2026-11-25T09:00:00Z", json.get("at").asString());
        assertEquals("H-1", json.get("header").get("id").asString());
        assertEquals("b", json.get("tags").get(1).asString());
        assertEquals("cafe", json.get("blob").asString());
    }
}
