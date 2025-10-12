package org.example.common.state;

/** Exception thrown when an invalid state transition is attempted. */
public class StateTransitionException extends RuntimeException {

    private final Enum<?> fromState;
    private final Enum<?> toState;

    public StateTransitionException(Enum<?> fromState, Enum<?> toState) {
        super(String.format("Invalid state transition from %s to %s", fromState, toState));
        this.fromState = fromState;
        this.toState = toState;
    }

    public StateTransitionException(Enum<?> fromState, Enum<?> toState, String message) {
        super(message);
        this.fromState = fromState;
        this.toState = toState;
    }

    public StateTransitionException(
            Enum<?> fromState, Enum<?> toState, String message, Throwable cause) {
        super(message, cause);
        this.fromState = fromState;
        this.toState = toState;
    }

    public Enum<?> getFromState() {
        return fromState;
    }

    public Enum<?> getToState() {
        return toState;
    }
}
