package org.example.common.state;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import org.example.common.model.ExecutionStatus;
import org.junit.jupiter.api.Test;

/** SPEC-0044 AC-7: an execution is applied, then possibly busted or corrected, and a correction can be busted. */
class ExecutionStatusMachineConfigTest {

    private final StateMachineConfig<ExecutionStatus> config = ExecutionStatusMachineConfig.config();

    @Test
    void transitionsAreExactly() {
        Map<ExecutionStatus, Set<ExecutionStatus>> expected = new EnumMap<>(ExecutionStatus.class);
        expected.put(ExecutionStatus.APPLIED, EnumSet.of(ExecutionStatus.BUSTED, ExecutionStatus.CORRECTED));
        expected.put(ExecutionStatus.CORRECTED, EnumSet.of(ExecutionStatus.BUSTED));
        expected.put(ExecutionStatus.BUSTED, EnumSet.noneOf(ExecutionStatus.class));

        Map<ExecutionStatus, Set<ExecutionStatus>> actual = new EnumMap<>(ExecutionStatus.class);
        for (ExecutionStatus from : ExecutionStatus.values()) {
            Set<ExecutionStatus> targets = config.getValidTransitions(from);
            actual.put(from, targets.isEmpty() ? EnumSet.noneOf(ExecutionStatus.class) : EnumSet.copyOf(targets));
        }
        assertEquals(expected, actual);
    }

    @Test
    void appliedIsInitialAndBustedTerminal() {
        assertEquals(Set.of(ExecutionStatus.APPLIED), config.getInitialStates());
        assertEquals(Set.of(ExecutionStatus.BUSTED), config.getTerminalStates());
    }
}
