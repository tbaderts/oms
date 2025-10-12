package org.example.common.state;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;

/**
 * A generic state machine that validates state transitions based on a configuration. This class is
 * immutable and thread-safe.
 *
 * @param <S> The state enum type
 */
public class StateMachine<S extends Enum<S>> {

    private final StateMachineConfig<S> config;

    /**
     * Creates a new state machine with the given configuration.
     *
     * @param config The state machine configuration
     */
    public StateMachine(StateMachineConfig<S> config) {
        this.config = Objects.requireNonNull(config, "Config cannot be null");
    }

    /**
     * Validates whether a transition from one state to another is allowed.
     *
     * @param from The source state
     * @param to The target state
     * @return true if the transition is valid, false otherwise
     */
    public boolean isValidTransition(S from, S to) {
        return config.isValidTransition(from, to);
    }

    /**
     * Attempts to perform a state transition.
     *
     * @param from The source state
     * @param to The target state
     * @return Optional containing the target state if valid, empty otherwise
     */
    public Optional<S> transition(S from, S to) {
        return isValidTransition(from, to) ? Optional.of(to) : Optional.empty();
    }

    /**
     * Creates a transition function for a specific source state. This is useful for functional
     * programming patterns.
     *
     * @param from The source state
     * @return A function that takes a target state and returns Optional of the state if valid
     */
    public Function<S, Optional<S>> transitionFrom(S from) {
        return to -> transition(from, to);
    }

    /**
     * Validates a sequence of state transitions.
     *
     * @param initial The initial state
     * @param transitions The sequence of states to transition through
     * @return Optional containing the final state if all transitions are valid, empty otherwise
     */
    @SafeVarargs
    public final Optional<S> transitionSequence(S initial, S... transitions) {
        Objects.requireNonNull(initial, "Initial state cannot be null");
        Optional<S> current = Optional.of(initial);

        for (S nextState : transitions) {
            Objects.requireNonNull(nextState, "Transition states cannot be null");
            current = current.flatMap(state -> transition(state, nextState));
            if (current.isEmpty()) {
                return Optional.empty();
            }
        }

        return current;
    }

    /**
     * Validates a sequence of state transitions and returns the path.
     *
     * @param initial The initial state
     * @param transitions The sequence of states to transition through
     * @return A transition result containing the path and final state if valid
     */
    @SafeVarargs
    public final TransitionResult<S> validateSequence(S initial, S... transitions) {
        Objects.requireNonNull(initial, "Initial state cannot be null");

        List<S> path = new ArrayList<>();
        path.add(initial);
        S current = initial;

        for (S nextState : transitions) {
            Objects.requireNonNull(nextState, "Transition states cannot be null");

            if (!isValidTransition(current, nextState)) {
                return TransitionResult.invalid(path, current, nextState);
            }

            path.add(nextState);
            current = nextState;
        }

        return TransitionResult.valid(path);
    }

    /**
     * Gets all valid target states from a given source state.
     *
     * @param from The source state
     * @return An unmodifiable set of valid target states
     */
    public Set<S> getValidTransitions(S from) {
        return config.getValidTransitions(from);
    }

    /**
     * Checks if a state is a terminal state.
     *
     * @param state The state to check
     * @return true if the state is terminal, false otherwise
     */
    public boolean isTerminalState(S state) {
        return config.isTerminalState(state);
    }

    /**
     * Checks if a state is an initial state.
     *
     * @param state The state to check
     * @return true if the state is an initial state, false otherwise
     */
    public boolean isInitialState(S state) {
        return config.isInitialState(state);
    }

    /**
     * Gets all terminal states.
     *
     * @return An unmodifiable set of terminal states
     */
    public Set<S> getTerminalStates() {
        return config.getTerminalStates();
    }

    /**
     * Gets all initial states.
     *
     * @return An unmodifiable set of initial states
     */
    public Set<S> getInitialStates() {
        return config.getInitialStates();
    }

    /**
     * Gets the configuration for this state machine.
     *
     * @return The state machine configuration
     */
    public StateMachineConfig<S> getConfig() {
        return config;
    }

    /**
     * Result of a state transition sequence validation.
     *
     * @param <S> The state enum type
     */
    public static class TransitionResult<S extends Enum<S>> {
        private final boolean valid;
        private final List<S> path;
        private final S failedFrom;
        private final S failedTo;

        private TransitionResult(boolean valid, List<S> path, S failedFrom, S failedTo) {
            this.valid = valid;
            this.path = Collections.unmodifiableList(new ArrayList<>(path));
            this.failedFrom = failedFrom;
            this.failedTo = failedTo;
        }

        static <S extends Enum<S>> TransitionResult<S> valid(List<S> path) {
            return new TransitionResult<>(true, path, null, null);
        }

        static <S extends Enum<S>> TransitionResult<S> invalid(
                List<S> path, S failedFrom, S failedTo) {
            return new TransitionResult<>(false, path, failedFrom, failedTo);
        }

        public boolean isValid() {
            return valid;
        }

        public List<S> getPath() {
            return path;
        }

        public S getFinalState() {
            return path.isEmpty() ? null : path.get(path.size() - 1);
        }

        public Optional<S> getFailedFrom() {
            return Optional.ofNullable(failedFrom);
        }

        public Optional<S> getFailedTo() {
            return Optional.ofNullable(failedTo);
        }

        public String getErrorMessage() {
            if (valid) {
                return "Transition sequence is valid";
            }
            return String.format("Invalid transition from %s to %s", failedFrom, failedTo);
        }

        @Override
        public String toString() {
            if (valid) {
                return String.format("TransitionResult[valid=true, path=%s]", path);
            }
            return String.format(
                    "TransitionResult[valid=false, path=%s, failedFrom=%s, failedTo=%s]",
                    path, failedFrom, failedTo);
        }
    }
}
