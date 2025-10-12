package org.example.common.state;

import java.util.Collections;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Configuration for a state machine defining valid state transitions. This class is immutable and
 * thread-safe.
 *
 * @param <S> The state enum type
 */
public class StateMachineConfig<S extends Enum<S>> {

    private final Class<S> stateClass;
    private final Map<S, Set<S>> validTransitions;
    private final Set<S> terminalStates;
    private final Set<S> initialStates;

    private StateMachineConfig(Builder<S> builder) {
        this.stateClass = builder.stateClass;
        this.validTransitions = Collections.unmodifiableMap(builder.validTransitions);
        this.terminalStates = Collections.unmodifiableSet(builder.terminalStates);
        this.initialStates = Collections.unmodifiableSet(builder.initialStates);
    }

    /**
     * Creates a new builder for the given state type.
     *
     * @param <S> The state enum type
     * @param stateClass The class of the state enum
     * @return A new builder instance
     */
    public static <S extends Enum<S>> Builder<S> builder(Class<S> stateClass) {
        return new Builder<>(stateClass);
    }

    /**
     * Gets all valid target states from the given source state.
     *
     * @param from The source state
     * @return An unmodifiable set of valid target states, or an empty set if none
     */
    public Set<S> getValidTransitions(S from) {
        return validTransitions.getOrDefault(from, Collections.emptySet());
    }

    /**
     * Checks if a transition from one state to another is valid.
     *
     * @param from The source state
     * @param to The target state
     * @return true if the transition is valid, false otherwise
     */
    public boolean isValidTransition(S from, S to) {
        if (from == null || to == null) {
            return false;
        }
        return getValidTransitions(from).contains(to);
    }

    /**
     * Checks if the given state is a terminal state (no outgoing transitions).
     *
     * @param state The state to check
     * @return true if the state is terminal, false otherwise
     */
    public boolean isTerminalState(S state) {
        return terminalStates.contains(state);
    }

    /**
     * Checks if the given state is an initial state.
     *
     * @param state The state to check
     * @return true if the state is an initial state, false otherwise
     */
    public boolean isInitialState(S state) {
        return initialStates.contains(state);
    }

    /**
     * Gets all terminal states.
     *
     * @return An unmodifiable set of terminal states
     */
    public Set<S> getTerminalStates() {
        return terminalStates;
    }

    /**
     * Gets all initial states.
     *
     * @return An unmodifiable set of initial states
     */
    public Set<S> getInitialStates() {
        return initialStates;
    }

    /**
     * Gets all states that have at least one valid transition.
     *
     * @return An unmodifiable set of all states with transitions
     */
    public Set<S> getAllStates() {
        return validTransitions.keySet();
    }

    public Class<S> getStateClass() {
        return stateClass;
    }

    /**
     * Builder for creating immutable StateMachineConfig instances.
     *
     * @param <S> The state enum type
     */
    public static class Builder<S extends Enum<S>> {

        private final Class<S> stateClass;
        private final Map<S, Set<S>> validTransitions;
        private final Set<S> terminalStates;
        private final Set<S> initialStates;

        private Builder(Class<S> stateClass) {
            this.stateClass = Objects.requireNonNull(stateClass, "State class cannot be null");
            this.validTransitions = new EnumMap<>(stateClass);
            this.terminalStates = new HashSet<>();
            this.initialStates = new HashSet<>();
        }

        /**
         * Adds a valid transition from one state to another.
         *
         * @param from The source state
         * @param to The target state
         * @return This builder for method chaining
         */
        public Builder<S> addTransition(S from, S to) {
            Objects.requireNonNull(from, "From state cannot be null");
            Objects.requireNonNull(to, "To state cannot be null");

            validTransitions.computeIfAbsent(from, k -> new HashSet<>()).add(to);
            return this;
        }

        /**
         * Adds multiple valid transitions from a single source state.
         *
         * @param from The source state
         * @param targets Valid target states
         * @return This builder for method chaining
         */
        @SafeVarargs
        public final Builder<S> addTransitions(S from, S... targets) {
            Objects.requireNonNull(from, "From state cannot be null");
            for (S to : targets) {
                addTransition(from, to);
            }
            return this;
        }

        /**
         * Marks a state as terminal (no outgoing transitions allowed).
         *
         * @param state The terminal state
         * @return This builder for method chaining
         */
        public Builder<S> addTerminalState(S state) {
            Objects.requireNonNull(state, "State cannot be null");
            terminalStates.add(state);
            validTransitions.putIfAbsent(state, Collections.emptySet());
            return this;
        }

        /**
         * Marks multiple states as terminal.
         *
         * @param states The terminal states
         * @return This builder for method chaining
         */
        @SafeVarargs
        public final Builder<S> addTerminalStates(S... states) {
            for (S state : states) {
                addTerminalState(state);
            }
            return this;
        }

        /**
         * Marks a state as an initial state.
         *
         * @param state The initial state
         * @return This builder for method chaining
         */
        public Builder<S> addInitialState(S state) {
            Objects.requireNonNull(state, "State cannot be null");
            initialStates.add(state);
            return this;
        }

        /**
         * Marks multiple states as initial states.
         *
         * @param states The initial states
         * @return This builder for method chaining
         */
        @SafeVarargs
        public final Builder<S> addInitialStates(S... states) {
            for (S state : states) {
                addInitialState(state);
            }
            return this;
        }

        /**
         * Builds the immutable StateMachineConfig.
         *
         * @return A new StateMachineConfig instance
         */
        public StateMachineConfig<S> build() {
            // Make all sets in the map immutable
            Map<S, Set<S>> immutableTransitions = new EnumMap<>(stateClass);
            validTransitions.forEach(
                    (key, value) ->
                            immutableTransitions.put(
                                    key, Collections.unmodifiableSet(new HashSet<>(value))));
            this.validTransitions.clear();
            this.validTransitions.putAll(immutableTransitions);

            return new StateMachineConfig<>(this);
        }
    }
}
