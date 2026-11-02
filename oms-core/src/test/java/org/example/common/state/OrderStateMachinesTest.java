package org.example.common.state;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

import org.example.common.model.Order;
import org.junit.jupiter.api.Test;

/**
 * SPEC-0029 AC-1: every processor asks the provider for an order's state machine. Today that is the
 * product machine for every order; it is where a leg's own configuration will be chosen.
 */
class OrderStateMachinesTest {

    private final OrderStateMachines machines = new OrderStateMachines();

    @Test
    void returnsTheProductMachineForEveryOrder() {
        var forOne = machines.forOrder(Order.builder().orderId("ORD-1").build());
        var forChild = machines.forOrder(Order.builder().orderId("ORD-2").parentOrderId("ORD-1").rootOrderId("ORD-1").build());

        assertSame(forOne, forChild, "one machine for now");
        assertEquals(OrderStateMachineConfig.product().getTerminalStates(), forOne.getTerminalStates());
        assertEquals(
                OrderStateMachineConfig.product().getValidTransitions(org.example.common.model.State.LIVE),
                forOne.getValidTransitions(org.example.common.model.State.LIVE));
    }
}
