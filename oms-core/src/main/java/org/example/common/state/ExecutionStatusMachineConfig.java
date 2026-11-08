package org.example.common.state;

import org.example.common.model.ExecutionStatus;

/**
 * The execution status machine (SPEC-0044).
 *
 * <pre>
 * APPLIED   → BUSTED      (EXEC_BUST, or EXEC_WHACK by an operator)
 * APPLIED   → CORRECTED   (EXEC_CORRECT; the replacing fill is a new execution)
 * CORRECTED → BUSTED      (a later bust of the corrected execution)
 * BUSTED      (terminal)
 * </pre>
 *
 * <p>Consulted before an execution lifecycle event is recorded, so a repeated or out-of-order bust
 * is refused instead of applied twice.
 */
public final class ExecutionStatusMachineConfig {

    private ExecutionStatusMachineConfig() {
        // Utility class
    }

    /** The configuration. */
    public static StateMachineConfig<ExecutionStatus> config() {
        return StateMachineConfig.builder(ExecutionStatus.class)
                .addInitialState(ExecutionStatus.APPLIED)
                .addTransitions(ExecutionStatus.APPLIED, ExecutionStatus.BUSTED, ExecutionStatus.CORRECTED)
                .addTransition(ExecutionStatus.CORRECTED, ExecutionStatus.BUSTED)
                .addTerminalState(ExecutionStatus.BUSTED)
                .build();
    }

    /** A state machine with this configuration. */
    public static StateMachine<ExecutionStatus> create() {
        return new StateMachine<>(config());
    }
}
