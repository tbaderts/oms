package org.example.common.state;

import org.example.common.model.State;

/**
 * Factory class for creating state machine configurations for orders. Provides predefined
 * configurations for common order lifecycle scenarios.
 *
 * <p>Provides three state machine configurations:
 * <ul>
 *   <li><strong>Standard</strong> - Full lifecycle with UNACK state (NEW → UNACK → LIVE → FILLED/CXL → CLOSED)</li>
 *   <li><strong>Simplified</strong> - Direct transitions without UNACK (NEW → LIVE → FILLED/CXL → CLOSED)</li>
 *   <li><strong>Extended</strong> - Includes EXP state for time-based expiration (LIVE → EXP → CLOSED)</li>
 * </ul>
 *
 * @see <a href="file:///oms-knowledge-base/oms-concepts/order-lifecycle.md">Order Lifecycle - State Machine Configurations</a>
 */
public final class OrderStateMachineConfig {

    private OrderStateMachineConfig() {
        // Utility class
    }

    /**
     * Creates the standard order state machine configuration.
     *
     * <p>State transitions: - NEW → UNACK - UNACK → LIVE, REJ - LIVE → FILLED, CXL, REJ - FILLED →
     * CLOSED - CXL → CLOSED - REJ → CLOSED - CLOSED (terminal) - EXP (terminal)
     *
     * @return A configured state machine for standard orders
     */
    public static StateMachineConfig<State> standard() {
        return StateMachineConfig.builder(State.class)
                .addInitialState(State.NEW)
                .addTransition(State.NEW, State.UNACK)
                .addTransitions(State.UNACK, State.LIVE, State.REJ)
                .addTransitions(State.LIVE, State.FILLED, State.CXL, State.REJ)
                .addTransition(State.FILLED, State.CLOSED)
                .addTransition(State.CXL, State.CLOSED)
                .addTransition(State.REJ, State.CLOSED)
                .addTerminalStates(State.CLOSED, State.EXP)
                .build();
    }

    /**
     * Creates a simplified order state machine configuration. Allows direct transitions without
     * intermediate states.
     *
     * <p>State transitions: - NEW → LIVE, REJ - LIVE → FILLED, CXL, REJ - FILLED → CLOSED - CXL →
     * CLOSED - REJ → CLOSED - CLOSED (terminal) - EXP (terminal)
     *
     * @return A configured state machine for simplified orders
     */
    public static StateMachineConfig<State> simplified() {
        return StateMachineConfig.builder(State.class)
                .addInitialState(State.NEW)
                .addTransitions(State.NEW, State.LIVE, State.REJ)
                .addTransitions(State.LIVE, State.FILLED, State.CXL, State.REJ)
                .addTransition(State.FILLED, State.CLOSED)
                .addTransition(State.CXL, State.CLOSED)
                .addTransition(State.REJ, State.CLOSED)
                .addTerminalStates(State.CLOSED, State.EXP)
                .build();
    }

    /**
     * Creates an extended order state machine configuration. Includes more complex transitions for
     * advanced scenarios.
     *
     * <p>State transitions: - NEW → UNACK - UNACK → LIVE, REJ - LIVE → FILLED, CXL, REJ, EXP -
     * FILLED → CLOSED - CXL → CLOSED - REJ → CLOSED - EXP → CLOSED - CLOSED (terminal)
     *
     * @return A configured state machine for extended orders
     */
    public static StateMachineConfig<State> extended() {
        return StateMachineConfig.builder(State.class)
                .addInitialState(State.NEW)
                .addTransition(State.NEW, State.UNACK)
                .addTransitions(State.UNACK, State.LIVE, State.REJ)
                .addTransitions(State.LIVE, State.FILLED, State.CXL, State.REJ, State.EXP)
                .addTransition(State.FILLED, State.CLOSED)
                .addTransition(State.CXL, State.CLOSED)
                .addTransition(State.REJ, State.CLOSED)
                .addTransition(State.EXP, State.CLOSED)
                .addTerminalState(State.CLOSED)
                .build();
    }

    /**
     * Creates a state machine instance with the standard configuration.
     *
     * @return A new StateMachine instance with standard configuration
     */
    public static StateMachine<State> createStandard() {
        return new StateMachine<>(standard());
    }

    /**
     * Creates a state machine instance with the simplified configuration.
     *
     * @return A new StateMachine instance with simplified configuration
     */
    public static StateMachine<State> createSimplified() {
        return new StateMachine<>(simplified());
    }

    /**
     * Creates a state machine instance with the extended configuration.
     *
     * @return A new StateMachine instance with extended configuration
     */
    public static StateMachine<State> createExtended() {
        return new StateMachine<>(extended());
    }
}
