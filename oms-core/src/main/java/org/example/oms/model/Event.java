package org.example.oms.model;

/**
 * The kinds of change recorded in an order's event log.
 *
 * <p>Persisted by name ({@code @Enumerated(EnumType.STRING)}), so values may be added freely;
 * existing values must not be renamed.
 */
public enum Event {
    /** Order created and accepted into the system. */
    NEW_ORDER,
    /** Order acknowledged by the market and moved to LIVE. */
    ACK,
    /** Execution applied, order partially filled. */
    PARTIAL_FILL,
    /** Execution applied, order fully filled. */
    FILL,
    /** Order cancelled. */
    CXL,
    /** Order rejected. */
    REJ,
    /** Client asked for the open quantity to be cancelled; cancelState is now PCXL. */
    CXL_REQUEST,
    /** Market refused a cancel request; cancelState is now REJ and the order stays live. */
    CXL_REJ,
    /** The order's time in force ran out; state EXP, nothing open (SPEC-0029). */
    EXP,
    /** The order was closed: nothing more happens to it; state CLOSED (SPEC-0029). */
    CLOSE,
    /**
     * An applied execution was busted (FIX ExecType H, trade cancel): it no longer counts, and the
     * order's quantities are reduced. {@code exec_id} names the execution (SPEC-0044).
     */
    EXEC_BUST,
    /**
     * An applied execution was corrected (FIX ExecType G): it no longer counts as reported, and a
     * replacing execution refers to it through {@code execRefId} (SPEC-0044).
     */
    EXEC_CORRECT,
    /** An operator cancelled an execution manually (whack); recorded like a bust (SPEC-0044). */
    EXEC_WHACK
}
