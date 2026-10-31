package org.example.oms.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import java.time.LocalDate;

import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * SPEC-0020: a projection's message is stored in the outbox's bytea payload as its binary Avro
 * encoding and decoded again by the publisher. Proven against a real Postgres column, with a decimal
 * whose bytes contain zeros: Avro's JSON encoding of such a value is what jsonb rejected.
 */
@Testcontainers
class AvroPayloadCodecTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    private final AvroPayloadCodec codec = new AvroPayloadCodec();

    @Test
    void roundTripsThroughPostgresBytea() throws Exception {
        OrderExecution original = OrderExecution.newBuilder()
                .setExecId("EX-1")
                .setLastQty(new BigDecimal("6.5536")) // unscaled 65536 = 0x010000: zero bytes
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

        String type = OrderExecution.getClassSchema().getFullName();
        byte[] stored;
        try (Connection db = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
            try (Statement ddl = db.createStatement()) {
                ddl.execute("create table payloads (p bytea)");
            }
            try (PreparedStatement insert = db.prepareStatement("insert into payloads (p) values (?)")) {
                insert.setBytes(1, codec.encode(original));
                insert.executeUpdate();
            }
            try (Statement select = db.createStatement(); ResultSet rs = select.executeQuery("select p from payloads")) {
                rs.next();
                stored = rs.getBytes(1);
            }
        }

        assertEquals(original, codec.decode(type, stored));
    }

    @Test
    void refusesTypesOutsideTheMessagePackage() {
        assertThrows(IllegalStateException.class, () -> codec.decode("java.lang.Runtime", new byte[0]));
        assertThrows(IllegalStateException.class, () -> codec.decode("org.example.common.model.msg.Missing", new byte[0]));
    }
}
