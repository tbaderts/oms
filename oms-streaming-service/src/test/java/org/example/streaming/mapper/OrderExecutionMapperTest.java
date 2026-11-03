package org.example.streaming.mapper;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import org.example.common.model.msg.OrderExecution;
import org.example.streaming.model.ExecutionDto;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class OrderExecutionMapperTest {

    /**
     * The default columns of the executions blotter, as oms-core's Execution metamodel lists them
     * (MetamodelServiceTest#executionMetamodelUsesExecIdAndResolvableDefaults pins that list).
     */
    private static final List<String> BLOTTER_DEFAULT_COLUMNS =
            List.of(
                    "execId",
                    "orderId",
                    "execType",
                    "lastQty",
                    "lastPx",
                    "cumQty",
                    "leavesQty",
                    "avgPx",
                    "transactTime");

    private final OrderExecutionMapper mapper = new OrderExecutionMapper();

    /** SPEC-0041 AC-7: in streaming mode too, every default column of the blotter has data. */
    @Test
    void executionDtoCarriesAllBlotterDefaultColumns() {
        OrderExecution fill = new OrderExecution();
        fill.setOrderId("ORD-1");
        fill.setRootOrderId("ORD-1");
        fill.setExecId("EX-1");
        fill.setExecType("F");
        fill.setLastQty(new BigDecimal("60.00000000"));
        fill.setLastPx(new BigDecimal("11.00000000"));
        fill.setCumQty(new BigDecimal("100.00000000"));
        fill.setLeavesQty(new BigDecimal("0E-8"));
        fill.setAvgPx(new BigDecimal("10.60000000"));
        fill.setTransactTime(Instant.parse("2026-11-03T10:00:00Z"));
        fill.setOrderVersion(4L);

        ExecutionDto dto = mapper.toExecutionDto(fill);
        JsonNode json = JsonMapper.builder().build().valueToTree(dto);

        for (String column : BLOTTER_DEFAULT_COLUMNS) {
            assertTrue(json.hasNonNull(column), column + " missing from " + json);
        }
        assertFalse(json.has("executionId"), "executionId is gone: " + json);
    }
}
