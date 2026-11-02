package org.example.simulator.kafka;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.example.common.model.msg.CommandHeader;
import org.example.simulator.engine.Cause;
import org.junit.jupiter.api.Test;

/**
 * SPEC-0025 AC-5: the header of every answer names the order tree it belongs to, the OMS event it
 * answers, and the simulator as producer.
 */
class CommandHeadersTest {

    private final CommandHeaders headers = new CommandHeaders("oms-exchange-simulator");

    @Test
    void answerWithoutItsOwnId_getsAFreshUuidAndTheCause() {
        CommandHeader first = headers.build(new Cause("ROOT-1", "ORD-1", 7L), null);
        CommandHeader second = headers.build(new Cause("ROOT-1", "ORD-1", 7L), null);

        assertDoesNotThrow(() -> UUID.fromString(first.getCommandId()));
        assertNotEquals(first.getCommandId(), second.getCommandId(), "a fresh id per command");
        assertEquals("ROOT-1", first.getCorrelationId());
        assertEquals("ORD-1:7", first.getCausationId());
        assertEquals("oms-exchange-simulator", first.getProducer());
        assertEquals("1.0.0", first.getVersion());
        assertTrue(Duration.between(first.getSentAt(), Instant.now()).abs().toSeconds() < 5, "sentAt is now");
    }

    @Test
    void lifecycleAnswer_keepsItsDeterministicId() {
        CommandHeader header = headers.build(new Cause("ROOT-1", "ORD-1", 7L), "ORD-1-CXL-7");

        assertEquals("ORD-1-CXL-7", header.getCommandId());
    }

    @Test
    void withoutRootOrEvent_correlatesToTheOrderAndHasNoCausation() {
        CommandHeader header = headers.build(new Cause(null, "ORD-2", null), null);

        assertEquals("ORD-2", header.getCorrelationId());
        assertNull(header.getCausationId());
    }
}
