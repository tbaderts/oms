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
    CXL_REJ
}
