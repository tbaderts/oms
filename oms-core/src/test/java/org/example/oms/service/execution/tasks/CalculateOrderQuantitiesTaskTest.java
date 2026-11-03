package org.example.oms.service.execution.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.repository.ExecutionRepository;
import org.junit.jupiter.api.Test;

/** SPEC-0041: avgPx is the volume-weighted average over the order's applied fills. */
class CalculateOrderQuantitiesTaskTest {

    private final ExecutionRepository executionRepository = mock(ExecutionRepository.class);
    private final CalculateOrderQuantitiesTask task =
            new CalculateOrderQuantitiesTask(executionRepository);

    @Test
    void avgPxIsVolumeWeightedOverAppliedFills() throws Exception {
        // First fill: 40 @ 10 on an order of 100, nothing applied yet.
        when(executionRepository.sumNotionalByOrderId("ORD-1")).thenReturn(BigDecimal.ZERO);
        OrderTaskContext first = context(null, "40", "10");

        assertTrue(task.execute(first).isSuccess());
        assertEquals(new BigDecimal("10.00000000"), first.getCalculatedAvgPx());

        // Second fill: 60 @ 11, with the first fill's 40 x 10 = 400 already applied.
        when(executionRepository.sumNotionalByOrderId("ORD-1")).thenReturn(new BigDecimal("400"));
        OrderTaskContext second = context("40", "60", "11");

        assertTrue(task.execute(second).isSuccess());
        assertEquals(new BigDecimal("10.60000000"), second.getCalculatedAvgPx());
    }

    @Test
    void avgPxRoundsHalfEvenAtScale8() throws Exception {
        // 1 @ 1.00000001 applied, then 1 @ 1: 2.00000001 / 2 = 1.000000005, an exact tie at the 9th
        // decimal. HALF_EVEN keeps the even 8th digit (1.00000000); HALF_UP would give 1.00000001.
        when(executionRepository.sumNotionalByOrderId("ORD-1"))
                .thenReturn(new BigDecimal("1.00000001"));
        OrderTaskContext tie = context("1", "1", "1");

        assertTrue(task.execute(tie).isSuccess());
        assertEquals(new BigDecimal("1.00000000"), tie.getCalculatedAvgPx());

        // A repeating quotient: 1 @ 1 applied, then 2 @ 2: 5 / 3 = 1.6666…, rounded to 1.66666667.
        when(executionRepository.sumNotionalByOrderId("ORD-1")).thenReturn(BigDecimal.ONE);
        OrderTaskContext repeating = context("1", "2", "2");

        assertTrue(task.execute(repeating).isSuccess());
        assertEquals(new BigDecimal("1.66666667"), repeating.getCalculatedAvgPx());
    }

    private static OrderTaskContext context(String cumQty, String lastQty, String lastPx) {
        OrderTaskContext context =
                new OrderTaskContext(
                        Order.builder()
                                .orderId("ORD-1")
                                .orderQty(new BigDecimal("100"))
                                .cumQty(cumQty == null ? null : new BigDecimal(cumQty))
                                .build());
        context.setExecution(
                Execution.builder()
                        .orderId("ORD-1")
                        .execId("EX-1")
                        .lastQty(new BigDecimal(lastQty))
                        .lastPx(new BigDecimal(lastPx))
                        .build());
        return context;
    }
}
