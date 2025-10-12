package org.example.common.state;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Optional;
import java.util.Set;

import org.example.common.model.State;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class StateMachineTest {

    private StateMachine<State> standardMachine;
    private StateMachine<State> simplifiedMachine;

    @BeforeEach
    void setUp() {
        standardMachine = OrderStateMachineConfig.createStandard();
        simplifiedMachine = OrderStateMachineConfig.createSimplified();
    }

    @Nested
    @DisplayName("Standard State Machine Tests")
    class StandardStateMachineTests {

        @Test
        @DisplayName("Should allow valid transition from NEW to UNACK")
        void testValidTransitionNewToUnack() {
            assertTrue(standardMachine.isValidTransition(State.NEW, State.UNACK));

            Optional<State> result = standardMachine.transition(State.NEW, State.UNACK);
            assertTrue(result.isPresent());
            assertEquals(State.UNACK, result.get());
        }

        @Test
        @DisplayName("Should reject invalid transition from NEW to LIVE")
        void testInvalidTransitionNewToLive() {
            assertFalse(standardMachine.isValidTransition(State.NEW, State.LIVE));

            Optional<State> result = standardMachine.transition(State.NEW, State.LIVE);
            assertFalse(result.isPresent());
        }

        @Test
        @DisplayName("Should allow valid transitions from UNACK to LIVE or REJ")
        void testValidTransitionsFromUnack() {
            assertTrue(standardMachine.isValidTransition(State.UNACK, State.LIVE));
            assertTrue(standardMachine.isValidTransition(State.UNACK, State.REJ));

            Set<State> validTransitions = standardMachine.getValidTransitions(State.UNACK);
            assertEquals(2, validTransitions.size());
            assertTrue(validTransitions.contains(State.LIVE));
            assertTrue(validTransitions.contains(State.REJ));
        }

        @Test
        @DisplayName("Should allow valid transitions from LIVE to FILLED, CXL, or REJ")
        void testValidTransitionsFromLive() {
            assertTrue(standardMachine.isValidTransition(State.LIVE, State.FILLED));
            assertTrue(standardMachine.isValidTransition(State.LIVE, State.CXL));
            assertTrue(standardMachine.isValidTransition(State.LIVE, State.REJ));

            Set<State> validTransitions = standardMachine.getValidTransitions(State.LIVE);
            assertEquals(3, validTransitions.size());
            assertTrue(validTransitions.contains(State.FILLED));
            assertTrue(validTransitions.contains(State.CXL));
            assertTrue(validTransitions.contains(State.REJ));
        }

        @Test
        @DisplayName("Should allow transition from terminal states to CLOSED")
        void testTransitionsToClosedState() {
            assertTrue(standardMachine.isValidTransition(State.FILLED, State.CLOSED));
            assertTrue(standardMachine.isValidTransition(State.CXL, State.CLOSED));
            assertTrue(standardMachine.isValidTransition(State.REJ, State.CLOSED));
        }

        @Test
        @DisplayName("Should not allow transitions from CLOSED terminal state")
        void testNoTransitionsFromClosed() {
            assertTrue(standardMachine.isTerminalState(State.CLOSED));
            Set<State> validTransitions = standardMachine.getValidTransitions(State.CLOSED);
            assertTrue(validTransitions.isEmpty());
        }

        @Test
        @DisplayName("Should validate complete valid sequence")
        void testValidCompleteSequence() {
            Optional<State> result =
                    standardMachine.transitionSequence(
                            State.NEW, State.UNACK, State.LIVE, State.FILLED, State.CLOSED);

            assertTrue(result.isPresent());
            assertEquals(State.CLOSED, result.get());
        }

        @Test
        @DisplayName("Should reject sequence with invalid transition")
        void testInvalidSequence() {
            // NEW -> LIVE is invalid in standard config
            Optional<State> result =
                    standardMachine.transitionSequence(State.NEW, State.LIVE, State.FILLED);

            assertFalse(result.isPresent());
        }

        @Test
        @DisplayName("Should validate partial valid sequence")
        void testValidPartialSequence() {
            Optional<State> result =
                    standardMachine.transitionSequence(State.NEW, State.UNACK, State.LIVE);

            assertTrue(result.isPresent());
            assertEquals(State.LIVE, result.get());
        }

        @Test
        @DisplayName("Should validate rejection path")
        void testRejectionPath() {
            Optional<State> result =
                    standardMachine.transitionSequence(
                            State.NEW, State.UNACK, State.REJ, State.CLOSED);

            assertTrue(result.isPresent());
            assertEquals(State.CLOSED, result.get());
        }

        @Test
        @DisplayName("Should validate cancellation path")
        void testCancellationPath() {
            Optional<State> result =
                    standardMachine.transitionSequence(
                            State.NEW, State.UNACK, State.LIVE, State.CXL, State.CLOSED);

            assertTrue(result.isPresent());
            assertEquals(State.CLOSED, result.get());
        }
    }

    @Nested
    @DisplayName("Simplified State Machine Tests")
    class SimplifiedStateMachineTests {

        @Test
        @DisplayName("Should allow direct transition from NEW to LIVE")
        void testDirectNewToLive() {
            assertTrue(simplifiedMachine.isValidTransition(State.NEW, State.LIVE));

            Optional<State> result = simplifiedMachine.transition(State.NEW, State.LIVE);
            assertTrue(result.isPresent());
            assertEquals(State.LIVE, result.get());
        }

        @Test
        @DisplayName("Should validate simplified sequence without UNACK")
        void testSimplifiedSequence() {
            Optional<State> result =
                    simplifiedMachine.transitionSequence(
                            State.NEW, State.LIVE, State.FILLED, State.CLOSED);

            assertTrue(result.isPresent());
            assertEquals(State.CLOSED, result.get());
        }

        @Test
        @DisplayName("Should reject UNACK in simplified machine")
        void testUnackRejected() {
            assertFalse(simplifiedMachine.isValidTransition(State.NEW, State.UNACK));
        }
    }

    @Nested
    @DisplayName("Transition Result Tests")
    class TransitionResultTests {

        @Test
        @DisplayName("Should return valid result with complete path")
        void testValidResultWithPath() {
            StateMachine.TransitionResult<State> result =
                    standardMachine.validateSequence(State.NEW, State.UNACK, State.LIVE);

            assertTrue(result.isValid());
            assertEquals(3, result.getPath().size()); // NEW + 2 transitions
            assertEquals(State.NEW, result.getPath().get(0));
            assertEquals(State.UNACK, result.getPath().get(1));
            assertEquals(State.LIVE, result.getPath().get(2));
            assertEquals(State.LIVE, result.getFinalState());
            assertFalse(result.getFailedFrom().isPresent());
            assertFalse(result.getFailedTo().isPresent());
        }

        @Test
        @DisplayName("Should return invalid result with failure details")
        void testInvalidResultWithFailure() {
            StateMachine.TransitionResult<State> result =
                    standardMachine.validateSequence(State.NEW, State.LIVE);

            assertFalse(result.isValid());
            assertEquals(1, result.getPath().size()); // Only NEW before failure
            assertEquals(State.NEW, result.getFinalState());
            assertTrue(result.getFailedFrom().isPresent());
            assertTrue(result.getFailedTo().isPresent());
            assertEquals(State.NEW, result.getFailedFrom().get());
            assertEquals(State.LIVE, result.getFailedTo().get());
            assertTrue(result.getErrorMessage().contains("Invalid transition"));
        }
    }

    @Nested
    @DisplayName("Functional Programming Tests")
    class FunctionalProgrammingTests {

        @Test
        @DisplayName("Should create transition function from specific state")
        void testTransitionFrom() {
            var transitionFromLive = standardMachine.transitionFrom(State.LIVE);

            Optional<State> filledResult = transitionFromLive.apply(State.FILLED);
            assertTrue(filledResult.isPresent());
            assertEquals(State.FILLED, filledResult.get());

            Optional<State> newResult = transitionFromLive.apply(State.NEW);
            assertFalse(newResult.isPresent());
        }
    }

    @Nested
    @DisplayName("Initial and Terminal State Tests")
    class InitialAndTerminalStateTests {

        @Test
        @DisplayName("Should identify NEW as initial state")
        void testInitialState() {
            assertTrue(standardMachine.isInitialState(State.NEW));
            assertFalse(standardMachine.isInitialState(State.LIVE));

            Set<State> initialStates = standardMachine.getInitialStates();
            assertEquals(1, initialStates.size());
            assertTrue(initialStates.contains(State.NEW));
        }

        @Test
        @DisplayName("Should identify terminal states")
        void testTerminalStates() {
            assertTrue(standardMachine.isTerminalState(State.CLOSED));
            assertTrue(standardMachine.isTerminalState(State.EXP));
            assertFalse(standardMachine.isTerminalState(State.LIVE));

            Set<State> terminalStates = standardMachine.getTerminalStates();
            assertEquals(2, terminalStates.size());
            assertTrue(terminalStates.contains(State.CLOSED));
            assertTrue(terminalStates.contains(State.EXP));
        }
    }

    @Nested
    @DisplayName("Null Safety Tests")
    class NullSafetyTests {

        @Test
        @DisplayName("Should handle null states safely")
        void testNullStates() {
            assertFalse(standardMachine.isValidTransition(null, State.LIVE));
            assertFalse(standardMachine.isValidTransition(State.NEW, null));
            assertFalse(standardMachine.isValidTransition(null, null));
        }

        @Test
        @DisplayName("Should throw exception for null in sequence")
        void testNullInSequence() {
            assertThrows(
                    NullPointerException.class,
                    () -> standardMachine.transitionSequence(null, State.LIVE));
        }
    }
}
