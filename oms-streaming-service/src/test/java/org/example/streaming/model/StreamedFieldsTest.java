package org.example.streaming.model;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import org.example.common.model.msg.CancelState;
import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderExecution;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.example.common.model.msg.TimeInForce;
import org.example.streaming.mapper.OrderExecutionMapper;
import org.example.streaming.mapper.OrderMessageMapper;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * SPEC-0056 AC-6: oms-ui shows a column in live mode only if it is in its list of streamed fields
 * (oms-ui/frontend/src/config/streamedFields.json). Every field on that list must really be filled
 * by this service: a fully populated Kafka record is mapped through the real mappers and each listed
 * field must be non-null in the JSON sent. A field sent but not listed is only hidden in live mode,
 * the safe side.
 *
 * <p>Not listed on purpose: {@code creationDate} (never set by the execution mapper) and the order's
 * {@code securityType} (filled from {@code securityDesc}, a different value than History mode shows).
 *
 * <p>The list lives in oms-ui and is read from the repository checkout (test only).
 */
class StreamedFieldsTest {

    private static final Path LIST = Path.of("..", "oms-ui", "frontend", "src", "config", "streamedFields.json");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    void everyListedFieldIsFilledByTheStream() throws Exception {
        assertTrue(Files.exists(LIST), "oms-ui's streamed-field list is missing at " + LIST.toAbsolutePath());
        JsonNode list = JSON.readTree(Files.readString(LIST));

        assertFilled(list.get("Order"), JSON.valueToTree(new OrderMessageMapper().toOrderDto(order())), "OrderDto");
        assertFilled(list.get("Execution"), JSON.valueToTree(new OrderExecutionMapper().toExecutionDto(fill())), "ExecutionDto");
    }

    private static void assertFilled(JsonNode listed, JsonNode sent, String dto) {
        assertTrue(listed != null && listed.isArray() && !listed.isEmpty(), dto + " list present");
        for (JsonNode field : listed) {
            assertTrue(sent.hasNonNull(field.asString()),
                    field.asString() + " is listed as streamed but " + dto + " does not fill it: " + sent);
        }
    }

    /** An order message with every field the order mapper reads. */
    private static OrderMessage order() {
        OrderMessage m = new OrderMessage();
        m.setOrderId("ORD-1");
        m.setParentOrderId("ORD-0");
        m.setRootOrderId("ORD-0");
        m.setClOrdId("CL-1");
        m.setAccount("ACC-1");
        m.setSymbol("AAPL");
        m.setSide(Side.BUY);
        m.setOrdType(OrdType.LIMIT);
        m.setState(State.LIVE);
        m.setCancelState(CancelState.PCXL);
        m.setOrderQty(new BigDecimal("100.00000000"));
        m.setCumQty(new BigDecimal("40.00000000"));
        m.setLeavesQty(new BigDecimal("60.00000000"));
        m.setPrice(new BigDecimal("170.00000000"));
        m.setStopPx(new BigDecimal("165.00000000"));
        m.setTimeInForce(TimeInForce.DAY);
        m.setSecurityId("US0378331005");
        m.setSecurityDesc("Apple Inc");
        m.setExDestination("XNAS");
        m.setText("note");
        m.setRejectReason("none");
        m.setSendingTime(Instant.parse("2026-11-09T09:59:00Z"));
        m.setTransactTime(Instant.parse("2026-11-09T10:00:00Z"));
        m.setExpireTime(Instant.parse("2026-11-10T21:00:00Z"));
        m.setEventId(3L);
        return m;
    }

    /** An order-execution record with every field the execution mapper reads. */
    private static OrderExecution fill() {
        OrderExecution f = new OrderExecution();
        f.setExecId("EX-1");
        f.setOrderId("ORD-1");
        f.setRootOrderId("ORD-1");
        f.setLastQty(new BigDecimal("40.00000000"));
        f.setLastPx(new BigDecimal("170.00000000"));
        f.setCumQty(new BigDecimal("40.00000000"));
        f.setLeavesQty(new BigDecimal("60.00000000"));
        f.setAvgPx(new BigDecimal("170.00000000"));
        f.setExecType("F");
        f.setLastMkt("XNAS");
        f.setLastCapacity("A");
        f.setTransactTime(Instant.parse("2026-11-09T10:00:00Z"));
        f.setOrderVersion(3L);
        return f;
    }
}
