package org.example.oms.service.command.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.example.common.model.Order;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.junit.jupiter.api.Test;

/** SPEC-0050: the expected-version check on its own: no version, equal, unequal, and a create. */
class CheckExpectedVersionTaskTest {

    private final CheckExpectedVersionTask task = new CheckExpectedVersionTask();

    @Test
    void withoutAnExpectedVersionThereIsNoCheck() {
        assertTrue(run(new OrderCancelRequestCmd().orderId("O1"), order("O1", 5)).isSuccess());
    }

    @Test
    void theCurrentVersionPasses() {
        assertTrue(run(new OrderCancelRequestCmd().orderId("O1").expectedVersion(5L), order("O1", 5)).isSuccess());
    }

    @Test
    void anotherVersionIsRefusedNamingBoth() {
        TaskResult result = run(new OrderCancelRequestCmd().orderId("O1").expectedVersion(4L), order("O1", 5));

        assertFalse(result.isSuccess());
        assertEquals("Expected version 4 but order O1 is at version 5", result.getMessage());
    }

    @Test
    void aCreateExpectsVersionZero() {
        assertTrue(run(new OrderCreateCmd().expectedVersion(0L), order(null, 0)).isSuccess());

        TaskResult refused = run(new OrderCreateCmd().expectedVersion(3L), order(null, 0));
        assertFalse(refused.isSuccess());
        assertEquals("Expected version 3 but the order is new (version 0)", refused.getMessage());
    }

    @Test
    void runsAfterDeduplication() {
        assertEquals(80, task.getOrder(), "after DeduplicateCommandTask (75), before validation (100)");
    }

    private TaskResult run(org.example.common.model.cmd.Command command, Order order) {
        OrderTaskContext context = new OrderTaskContext(order);
        context.setCommand(command);
        return task.execute(context);
    }

    private static Order order(String orderId, long txNr) {
        return Order.builder().orderId(orderId).txNr(txNr).build();
    }
}
