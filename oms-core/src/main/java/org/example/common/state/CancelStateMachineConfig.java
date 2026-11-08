package org.example.common.state;

import org.example.common.model.CancelState;

/**
 * The cancel state machine, orthogonal to the order state (SPEC-0044).
 *
 * <pre>
 * NONE, REJ, CXL, PMOD → PCXL   (cancel request; refused while one is already pending)
 * PCXL → REJ                    (the market refused the cancel request)
 * NONE, PCXL → CXL              (the market cancelled, asked for or not)
 * </pre>
 *
 * <p>An order with no cancel activity has a {@code null} cancel state, and {@link CancelState} is a
 * contract enum, so the machine runs over {@link Node}, which adds {@code NONE} for that case. The
 * rules about the order itself (it must be LIVE with open quantity for a request, and not CLOSED for
 * a cancel reject) stay with the lifecycle validation; only the cancel-state rules live here. A
 * venue cancel is governed by the order state machine, so the {@code CXL} transitions are listed for
 * completeness and not consulted.
 */
public final class CancelStateMachineConfig {

    /** A cancel state, with {@code NONE} for an order that has none. */
    public enum Node {
        NONE,
        CXL,
        PCXL,
        PMOD,
        REJ;

        /** The node for an order's cancel state; {@code null} is {@code NONE}. */
        public static Node of(CancelState cancelState) {
            return cancelState == null ? NONE : valueOf(cancelState.name());
        }
    }

    private CancelStateMachineConfig() {
        // Utility class
    }

    /** The configuration. */
    public static StateMachineConfig<Node> config() {
        return StateMachineConfig.builder(Node.class)
                .addInitialState(Node.NONE)
                .addTransitions(Node.NONE, Node.PCXL, Node.CXL)
                .addTransitions(Node.PCXL, Node.REJ, Node.CXL)
                .addTransition(Node.REJ, Node.PCXL)
                .addTransition(Node.CXL, Node.PCXL)
                .addTransition(Node.PMOD, Node.PCXL)
                .build();
    }

    /** A state machine with this configuration. */
    public static StateMachine<Node> create() {
        return new StateMachine<>(config());
    }
}
