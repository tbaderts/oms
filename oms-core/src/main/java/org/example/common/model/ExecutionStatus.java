package org.example.common.model;

/**
 * Where an execution is in its lifecycle (SPEC-0044). Persisted by name; the allowed transitions are
 * {@link org.example.common.state.ExecutionStatusMachineConfig}.
 */
public enum ExecutionStatus {
    /** The fill counts towards the order's quantities and average price. */
    APPLIED,
    /** Busted by the venue or cancelled manually (whack): it no longer counts. */
    BUSTED,
    /** Replaced by a correcting execution that refers to it through execRefId: it no longer counts. */
    CORRECTED
}
