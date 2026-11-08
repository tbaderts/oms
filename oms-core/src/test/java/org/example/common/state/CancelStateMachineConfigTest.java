package org.example.common.state;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import org.example.common.model.CancelState;
import org.example.common.state.CancelStateMachineConfig.Node;
import org.junit.jupiter.api.Test;

/** SPEC-0044 AC-11: the cancel state, orthogonal to the order state, as a configuration. */
class CancelStateMachineConfigTest {

    private final StateMachineConfig<Node> config = CancelStateMachineConfig.config();

    @Test
    void transitionsAreExactly() {
        Map<Node, Set<Node>> expected = new EnumMap<>(Node.class);
        expected.put(Node.NONE, EnumSet.of(Node.PCXL, Node.CXL));
        expected.put(Node.PCXL, EnumSet.of(Node.REJ, Node.CXL));
        expected.put(Node.REJ, EnumSet.of(Node.PCXL));
        expected.put(Node.CXL, EnumSet.of(Node.PCXL));
        expected.put(Node.PMOD, EnumSet.of(Node.PCXL));

        Map<Node, Set<Node>> actual = new EnumMap<>(Node.class);
        for (Node from : Node.values()) {
            Set<Node> targets = config.getValidTransitions(from);
            actual.put(from, targets.isEmpty() ? EnumSet.noneOf(Node.class) : EnumSet.copyOf(targets));
        }
        assertEquals(expected, actual);
    }

    @Test
    void noCancelActivityIsNone() {
        assertEquals(Node.NONE, Node.of(null));
        for (CancelState state : CancelState.values()) {
            assertEquals(state.name(), Node.of(state).name());
        }
        assertEquals(Set.of(Node.NONE), config.getInitialStates());
    }
}
