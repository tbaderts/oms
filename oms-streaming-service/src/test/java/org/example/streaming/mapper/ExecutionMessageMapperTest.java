package org.example.streaming.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.example.common.model.msg.Execution;
import org.example.common.model.msg.SecurityIDSource;
import org.example.streaming.model.ExecutionDto;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** SPEC-0071 AC-3: a live fill comes from the Execution record on oms_executions. */
class ExecutionMessageMapperTest {

    /**
     * The default columns of the executions blotter, as oms-core's Execution metamodel lists them
     * (MetamodelServiceTest pins that list).
     */
    private static final List<String> BLOTTER_DEFAULT_COLUMNS = List.of(
            "execId", "orderId", "symbol", "execType", "lastQty", "lastPx", "lastMkt",
            "cumQty", "leavesQty", "avgPx", "transactTime");

    private final ExecutionMessageMapper mapper = new ExecutionMessageMapper();

    @Test
    void mapsTheFillAsTheVenueReportedIt() {
        ExecutionDto dto = mapper.toExecutionDto(fill());

        assertEquals("ORD-1-F1", dto.getExecId());
        assertEquals("ORD-1", dto.getOrderId());
        assertEquals("AAPL", dto.getSymbol());
        assertEquals("US0378331005", dto.getSecurityId());
        assertEquals(0, new BigDecimal("60").compareTo(dto.getLastQty()));
        assertEquals(0, new BigDecimal("11").compareTo(dto.getLastPx()));
        assertEquals(0, new BigDecimal("100").compareTo(dto.getCumQty()));
        assertEquals(0, BigDecimal.ZERO.compareTo(dto.getLeavesQty()));
        assertEquals(0, new BigDecimal("10.6").compareTo(dto.getAvgPx()));
        assertEquals("F", dto.getExecType());
        assertEquals("XSIM", dto.getLastMkt());
        assertEquals("A", dto.getLastCapacity());
        assertEquals(Instant.parse("2026-11-03T10:00:00Z"), dto.getTransactTime());
        assertEquals(4L, dto.getOrderVersion());
        assertEquals(4L, dto.getSequenceNumber());
    }

    /** The status a live filter sees: from the FIX ExecType, H a bust and G a correction (SPEC-0044). */
    @Test
    void statusFollowsTheExecType() {
        Execution trade = fill();
        assertEquals("APPLIED", mapper.toExecutionDto(trade).getStatus());
        trade.setExecType("H");
        assertEquals("BUSTED", mapper.toExecutionDto(trade).getStatus());
        trade.setExecType("G");
        assertEquals("CORRECTED", mapper.toExecutionDto(trade).getStatus());
    }

    /** In streaming mode too, every default column of the blotter has data (SPEC-0041 AC-7). */
    @Test
    void executionDtoCarriesAllBlotterDefaultColumns() {
        JsonNode json = JsonMapper.builder().build().valueToTree(mapper.toExecutionDto(fill()));

        for (String column : BLOTTER_DEFAULT_COLUMNS) {
            assertTrue(json.hasNonNull(column), column + " missing from " + json);
        }
    }

    private static Execution fill() {
        return Execution.newBuilder()
                .setExecId("ORD-1-F1")
                .setOrderId("ORD-1")
                .setRootOrderId("ORD-1")
                .setSymbol("AAPL")
                .setSecurityId("US0378331005")
                .setSecurityIdSource(SecurityIDSource.ISIN)
                .setLastQty(new BigDecimal("60.00000000"))
                .setLastPx(new BigDecimal("11.00000000"))
                .setCumQty(new BigDecimal("100.00000000"))
                .setLeavesQty(new BigDecimal("0E-8"))
                .setAvgPx(new BigDecimal("10.60000000"))
                .setExecType("F")
                .setLastMkt("XSIM")
                .setLastCapacity("A")
                .setTransactTime(Instant.parse("2026-11-03T10:00:00Z"))
                .setOrderVersion(4L)
                .build();
    }
}
