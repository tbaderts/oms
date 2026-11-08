package org.example.common.state;

import org.example.common.model.State;

/**
 * The order state machine the OMS runs (SPEC-0029).
 *
 * <p>One product configuration: the full lifecycle with acknowledgement, expiry and close.
 *
 * <pre>
 * NEW    → UNACK
 * UNACK  → LIVE, REJ, EXP
 * LIVE   → FILLED, CXL, REJ, EXP, CLOSED
 * FILLED → LIVE   (a bust that reopens quantity, SPEC-0044)
 * FILLED, CXL, REJ, EXP → CLOSED
 * CLOSED   (terminal)
 * </pre>
 *
 * <p>CLOSED means nothing more will happen to the order: an administrative close of a live order,
 * or the end-of-day close of a finished one. It is the only terminal state. EXP is reached when the
 * time in force runs out, from the venue or from the OMS's own expiry step.
 *
 * <p>Processors obtain the machine through {@link OrderStateMachines}, where a configuration per leg
 * will be chosen once order trees exist.
 *
 * @see <a href="file:///oms-knowledge-base/oms-concepts/order-lifecycle.md">Order Lifecycle</a>
 */
public final class OrderStateMachineConfig {

    private OrderStateMachineConfig() {
        // Utility class
    }

    /** The product configuration. */
    public static StateMachineConfig<State> product() {
        return StateMachineConfig.builder(State.class)
                .addInitialState(State.NEW)
                .addTransition(State.NEW, State.UNACK)
                .addTransitions(State.UNACK, State.LIVE, State.REJ, State.EXP)
                .addTransitions(State.LIVE, State.FILLED, State.CXL, State.REJ, State.EXP, State.CLOSED)
                // A bust that reopens quantity moves a filled order back to LIVE (SPEC-0044).
                .addTransitions(State.FILLED, State.LIVE, State.CLOSED)
                .addTransition(State.CXL, State.CLOSED)
                .addTransition(State.REJ, State.CLOSED)
                .addTransition(State.EXP, State.CLOSED)
                .addTerminalState(State.CLOSED)
                .build();
    }

    /** A state machine with the product configuration. */
    public static StateMachine<State> createProduct() {
        return new StateMachine<>(product());
    }
}
