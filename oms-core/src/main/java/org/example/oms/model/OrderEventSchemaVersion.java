package org.example.oms.model;

/**
 * The current schema version of an event's command and snapshot JSON (SPEC-0024). One place knows
 * it, so the version bump is a change to this class beside the documented upcast step, not a
 * scatter of literals; the catch-up rule for rows written without the column lives in
 * oms-knowledge-base/oms-framework/oms-state-store.md.
 */
public final class OrderEventSchemaVersion {

    public static final int CURRENT = 1;

    private OrderEventSchemaVersion() {
    }
}
