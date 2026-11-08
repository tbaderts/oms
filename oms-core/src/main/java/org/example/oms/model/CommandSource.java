package org.example.oms.model;

/** Where a command entered the OMS (SPEC-0046). Persisted by name in {@code command_log.source}. */
public enum CommandSource {
    /** The command API, {@code POST /api/command/execute}. */
    REST,
    /** The commands topic. */
    KAFKA,
    /** The OMS's own scheduled jobs: end-of-day close and expiry. */
    SCHEDULER
}
