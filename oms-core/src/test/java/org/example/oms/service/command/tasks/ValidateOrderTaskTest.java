package org.example.oms.service.command.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.example.common.model.OrdType;
import org.example.common.model.Order;
import org.example.common.model.Side;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.junit.jupiter.api.Test;

class ValidateOrderTaskTest {

    private final ValidateOrderTask task = new ValidateOrderTask();

    @Test
    void execute_whenSessionIdMissing_returnsFailedValidation() throws Exception {
        Order order =
                Order.builder()
                        .symbol("AAPL")
                        .side(Side.BUY)
                        .account("ACC-1")
                        .clOrdId("CL-1")
                        .ordType(OrdType.MARKET)
                        .orderQty(java.math.BigDecimal.ONE)
                        .build();
        OrderTaskContext context = new OrderTaskContext(order);

        TaskResult result = task.execute(context);

        assertEquals(TaskResult.Status.FAILED, result.getStatus());
        assertEquals("SessionId is required", result.getMessage());
        assertEquals("SessionId is required", context.getErrorMessage());
    }
}
