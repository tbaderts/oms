package org.example.oms.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.msg.CommandHeader;
import org.junit.jupiter.api.Test;

/** SPEC-0025 AC-3: the Kafka command header lands on the command model's base fields. */
class CommandHeaderMapperTest {

    private final CommandHeaderMapper mapper = new CommandHeaderMapper();

    @Test
    void copiesEveryHeaderFieldAndNamesTheType() {
        Instant sentAt = Instant.parse("2026-11-01T10:15:30.123456Z");
        CommandHeader header = CommandHeader.newBuilder()
                .setCommandId("cmd-1")
                .setCorrelationId("ROOT-1")
                .setCausationId("ORD-1:7")
                .setSentAt(sentAt)
                .setProducer("oms-exchange-simulator")
                .setVersion("1.0.0")
                .setExpectedVersion(4L)
                .build();
        OrderCancelRequestCmd command = new OrderCancelRequestCmd();
        command.setOrderId("ORD-1");

        OrderCancelRequestCmd mapped = mapper.apply(header, command);

        assertSame(command, mapped);
        assertEquals("OrderCancelRequestCmd", mapped.getType());
        assertEquals("1.0.0", mapped.getVersion());
        assertEquals("cmd-1", mapped.getCommandId());
        assertEquals("ROOT-1", mapped.getCorrelationId());
        assertEquals("ORD-1:7", mapped.getCausationId());
        assertEquals(OffsetDateTime.of(2026, 11, 1, 10, 15, 30, 123_456_000, ZoneOffset.UTC), mapped.getSentAt());
        assertEquals("ORD-1", mapped.getOrderId());
        assertEquals(4L, mapped.getExpectedVersion(), "the version the sender acted on (SPEC-0050)");
    }

    @Test
    void optionalIdsStayNull() {
        CommandHeader header = CommandHeader.newBuilder()
                .setCommandId("cmd-2")
                .setSentAt(Instant.now())
                .setProducer("p")
                .build();

        OrderAcceptCmd mapped = mapper.apply(header, new OrderAcceptCmd());

        assertEquals("cmd-2", mapped.getCommandId());
        assertNull(mapped.getCorrelationId());
        assertNull(mapped.getCausationId());
        assertNull(mapped.getExpectedVersion(), "no expected version: no check (SPEC-0050)");
    }
}
