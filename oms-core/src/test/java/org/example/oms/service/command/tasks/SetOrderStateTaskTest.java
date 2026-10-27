package org.example.oms.service.command.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.service.sla.OrderSlaRecorder;
import org.junit.jupiter.api.Test;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

class SetOrderStateTaskTest {

    private final SetOrderStateTask task =
            new SetOrderStateTask(new OrderSlaRecorder(new SimpleMeterRegistry(), Clock.systemUTC()));

    /**
     * order-lifecycle.md §8.1: a NEW or UNACK order has nothing executed and everything open. Leaving
     * the quantities null made a resting order look as if nothing were open, and the cancel request
     * precondition (leavesQty > 0) refused it.
     */
    @Test
    void execute_opensTheWholeOrderQuantity() {
        OrderTaskContext context =
                new OrderTaskContext(Order.builder().clOrdId("C-1").orderQty(new BigDecimal("100")).build());
        context.setReceivedTime(Instant.now());

        TaskResult result = task.execute(context);

        assertTrue(result.isSuccess(), result.getMessage());
        Order order = context.getOrder();
        assertEquals(State.UNACK, order.getState());
        assertEquals(0, BigDecimal.ZERO.compareTo(order.getCumQty()));
        assertEquals(0, new BigDecimal("100").compareTo(order.getLeavesQty()));
    }
}
