package org.example.oms.service.lifecycle.tasks;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.example.common.model.CancelState;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.state.OrderStateMachines;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.service.lifecycle.LifecycleAction;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * SPEC-0044 AC-11: moving the cancel-state rules into a state machine configuration changes no
 * decision. Every combination of order state, cancel state and open quantity is checked against the
 * preconditions as they were hand-coded before.
 */
class ValidateLifecycleActionTaskTest {

    private final ValidateLifecycleActionTask task = new ValidateLifecycleActionTask(new OrderStateMachines());

    static Stream<Arguments> combinations() {
        List<Arguments> all = new ArrayList<>();
        List<CancelState> cancelStates = new ArrayList<>();
        cancelStates.add(null);
        cancelStates.addAll(List.of(CancelState.values()));
        for (LifecycleAction action : List.of(LifecycleAction.CANCEL_REQUEST, LifecycleAction.CANCEL_REJECT)) {
            for (State state : State.values()) {
                for (CancelState cancelState : cancelStates) {
                    for (BigDecimal leaves : List.of(BigDecimal.ZERO, new BigDecimal("40"))) {
                        all.add(Arguments.of(action, state, cancelState, leaves));
                    }
                }
            }
        }
        return all.stream();
    }

    @ParameterizedTest(name = "{0} on {1}/{2} leaves {3}")
    @MethodSource("combinations")
    void cancelRulesMatchThePreviousPreconditions(
            LifecycleAction action, State state, CancelState cancelState, BigDecimal leaves) {
        Order order = Order.builder()
                .orderId("ORD-1")
                .state(state)
                .cancelState(cancelState)
                .leavesQty(leaves)
                .build();
        OrderTaskContext context = new OrderTaskContext(order);
        context.setLifecycleAction(action);

        boolean allowed = task.execute(context).isSuccess();

        assertEquals(previousRule(action, state, cancelState, leaves), allowed);
    }

    /** The preconditions exactly as ValidateLifecycleActionTask hand-coded them before SPEC-0044. */
    private static boolean previousRule(LifecycleAction action, State state, CancelState cancelState, BigDecimal leaves) {
        return switch (action) {
            case CANCEL_REQUEST -> state == State.LIVE && leaves.signum() > 0 && cancelState != CancelState.PCXL;
            case CANCEL_REJECT -> cancelState == CancelState.PCXL && state != State.CLOSED;
            default -> throw new IllegalArgumentException(action.name());
        };
    }
}
