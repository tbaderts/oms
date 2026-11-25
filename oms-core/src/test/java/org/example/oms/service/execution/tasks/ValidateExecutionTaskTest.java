package org.example.oms.service.execution.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.junit.jupiter.api.Test;

/** SPEC-0069 AC-3, AC-4: a fill names an instrument, and not one other than its order's. */
class ValidateExecutionTaskTest {

    private final ValidateExecutionTask task = new ValidateExecutionTask();

    @Test
    void acceptsFillOnTheOrdersSymbol() throws Exception {
        assertTrue(task.execute(context(order("MSFT", "US5949181045"), fill("MSFT", "US5949181045"))).isSuccess());
    }

    @Test
    void refusesFillWithoutInstrument() throws Exception {
        TaskResult result = task.execute(context(order("MSFT", null), fill(null, null)));

        assertTrue(result.isFailed());
        assertEquals("Instrument is required: the fill carries neither symbol nor securityId", result.getMessage());
    }

    @Test
    void refusesBlankInstrument() throws Exception {
        assertTrue(task.execute(context(order("MSFT", null), fill(" ", ""))).isFailed());
    }

    /** Kafka has no minLength check: a blank value is refused rather than stored as whitespace. */
    @Test
    void refusesBlankSymbolNextToSecurityId() throws Exception {
        TaskResult result = task.execute(context(order("MSFT", "US5949181045"), fill(" ", "US5949181045")));

        assertTrue(result.isFailed());
        assertEquals("Fill symbol must not be blank", result.getMessage());
        assertEquals(
                "Fill securityId must not be blank",
                task.execute(context(order("MSFT", null), fill("MSFT", " "))).getMessage());
    }

    @Test
    void refusesSymbolMismatch() throws Exception {
        TaskResult result = task.execute(context(order("MSFT", null), fill("AAPL", null)));

        assertTrue(result.isFailed());
        assertEquals("Fill symbol AAPL does not match the order's symbol MSFT", result.getMessage());
    }

    @Test
    void refusesSecurityIdMismatch() throws Exception {
        TaskResult result = task.execute(context(order("MSFT", "US5949181045"), fill(null, "US0378331005")));

        assertTrue(result.isFailed());
        assertEquals(
                "Fill securityId US0378331005 does not match the order's securityId US5949181045",
                result.getMessage());
    }

    /** Deferred symbology: a securityId cannot be checked against an order that has only a symbol. */
    @Test
    void acceptsSecurityIdOnlyAgainstSymbolOnlyOrder() throws Exception {
        assertTrue(task.execute(context(order("MSFT", null), fill(null, "US5949181045"))).isSuccess());
    }

    @Test
    void acceptsSecurityIdOnlyFillMatchingTheOrder() throws Exception {
        assertTrue(task.execute(context(order("MSFT", "US5949181045"), fill(null, "US5949181045"))).isSuccess());
    }

    private static Order order(String symbol, String securityId) {
        return Order.builder().orderId("ORD-1").state(State.LIVE).symbol(symbol).securityId(securityId).build();
    }

    private static Execution fill(String symbol, String securityId) {
        return Execution.builder()
                .orderId("ORD-1")
                .execId("EX-1")
                .lastQty(new BigDecimal("10"))
                .lastPx(new BigDecimal("420"))
                .symbol(symbol)
                .securityId(securityId)
                .build();
    }

    private static OrderTaskContext context(Order order, Execution execution) {
        OrderTaskContext context = new OrderTaskContext(order);
        context.setExecution(execution);
        return context;
    }
}
