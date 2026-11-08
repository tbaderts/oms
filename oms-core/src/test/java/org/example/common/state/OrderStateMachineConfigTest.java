package org.example.common.state;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import org.example.common.model.State;
import org.junit.jupiter.api.Test;

/** SPEC-0029 AC-1: the one product state machine, with expiry and close; SPEC-0044 AC-7: FILLED → LIVE. */
class OrderStateMachineConfigTest {

    private final StateMachineConfig<State> product = OrderStateMachineConfig.product();

    @Test
    void productTransitionsAreExactly() {
        Map<State, Set<State>> expected = new EnumMap<>(State.class);
        expected.put(State.NEW, EnumSet.of(State.UNACK));
        expected.put(State.UNACK, EnumSet.of(State.LIVE, State.REJ, State.EXP));
        expected.put(State.LIVE, EnumSet.of(State.FILLED, State.CXL, State.REJ, State.EXP, State.CLOSED));
        // FILLED → LIVE: a bust that reopens quantity (SPEC-0044 AC-7)
        expected.put(State.FILLED, EnumSet.of(State.LIVE, State.CLOSED));
        expected.put(State.CXL, EnumSet.of(State.CLOSED));
        expected.put(State.REJ, EnumSet.of(State.CLOSED));
        expected.put(State.EXP, EnumSet.of(State.CLOSED));
        expected.put(State.CLOSED, EnumSet.noneOf(State.class));

        Map<State, Set<State>> actual = new EnumMap<>(State.class);
        for (State from : State.values()) {
            actual.put(from, EnumSet.copyOf(withNone(product.getValidTransitions(from))));
        }
        assertEquals(expected, actual);
    }

    @Test
    void onlyClosedIsTerminal() {
        assertEquals(Set.of(State.CLOSED), product.getTerminalStates());
        assertEquals(Set.of(State.NEW), product.getInitialStates());
    }

    private static Set<State> withNone(Set<State> states) {
        return states.isEmpty() ? EnumSet.noneOf(State.class) : states;
    }
}
