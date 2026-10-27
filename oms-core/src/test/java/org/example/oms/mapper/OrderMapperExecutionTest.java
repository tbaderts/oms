package org.example.oms.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneOffset;

import org.example.common.model.Execution;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

/**
 * An {@code ExecutionCreateCmd} is the only way a fill reaches the OMS over the command API, so
 * every fill field must survive the mapping. Before SPEC-0001 the mapper ignored all of them,
 * including execID, and every fill command was refused by validation.
 */
class OrderMapperExecutionTest {

    private final OrderMapper mapper = Mappers.getMapper(OrderMapper.class);

    @Test
    void toExecution_carriesEveryFillField() {
        Instant transactTime = Instant.parse("2026-10-24T09:30:00Z");
        org.example.common.model.cmd.Execution command =
                new org.example.common.model.cmd.Execution()
                        .execId("ORD-1-F1")
                        .orderId("ORD-1")
                        .lastQty(new BigDecimal("33"))
                        .lastPx(new BigDecimal("170.0000"))
                        .cumQty(new BigDecimal("33"))
                        .leavesQty(new BigDecimal("67"))
                        .execType("F")
                        .lastMkt("XSIM")
                        .lastCapacity("A")
                        .transactTime(transactTime.atOffset(ZoneOffset.UTC));

        Execution execution = mapper.toExecution(command);

        assertEquals("ORD-1-F1", execution.getExecID());
        assertEquals("ORD-1", execution.getOrderId());
        assertEquals(0, new BigDecimal("33").compareTo(execution.getLastQty()));
        assertEquals(0, new BigDecimal("170").compareTo(execution.getLastPx()));
        assertEquals(0, new BigDecimal("33").compareTo(execution.getCumQty()));
        assertEquals(0, new BigDecimal("67").compareTo(execution.getLeavesQty()));
        assertEquals("F", execution.getExecType());
        assertEquals("XSIM", execution.getLastMkt());
        assertEquals("A", execution.getLastCapacity());
        assertEquals(transactTime, execution.getTransactTime());
    }

    @Test
    void toCmdExecution_mapsTheAvroRecordWithoutTouchingItsSchema() {
        Instant transactTime = Instant.parse("2026-10-24T09:30:00Z");
        org.example.common.model.msg.Execution message =
                org.example.common.model.msg.Execution.newBuilder()
                        .setExecId("ORD-1-F2")
                        .setOrderId("ORD-1")
                        .setLastQty(new BigDecimal("34.0000"))
                        .setLastPx(new BigDecimal("170.0000"))
                        .setCumQty(new BigDecimal("100.0000"))
                        .setLeavesQty(new BigDecimal("0.0000"))
                        .setExecType("F")
                        .setLastMkt("XSIM")
                        .setTransactTime(transactTime)
                        .build();

        org.example.common.model.cmd.Execution command = mapper.toCmdExecution(message);

        assertEquals("ORD-1-F2", command.getExecId());
        assertEquals("ORD-1", command.getOrderId());
        assertEquals(0, new BigDecimal("34").compareTo(command.getLastQty()));
        assertEquals(0, new BigDecimal("170").compareTo(command.getLastPx()));
        assertEquals(0, new BigDecimal("100").compareTo(command.getCumQty()));
        assertEquals(0, BigDecimal.ZERO.compareTo(command.getLeavesQty()));
        assertEquals("F", command.getExecType());
        assertEquals("XSIM", command.getLastMkt());
        assertEquals(transactTime, command.getTransactTime().toInstant());
    }
}
