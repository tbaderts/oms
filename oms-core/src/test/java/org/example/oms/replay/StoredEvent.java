package org.example.oms.replay;

import org.example.common.model.Order;
import org.example.common.model.cmd.Command;

/**
 * One {@code order_events} row as the replay harness reads it (SPEC-0024): the stored command and
 * snapshot decoded to the current model, after the upcasting rule.
 *
 * @param id the row's id: the order in which commands were applied
 * @param orderId the order the event belongs to
 * @param version the order's event version
 * @param event the event name
 * @param resultingState the state the event left the order in, as stored
 * @param schemaVersion the schema version the row was read as; 1 for a legacy row
 * @param legacy whether the row had no {@code schema_version} (written before SPEC-0024)
 * @param command the command that caused the event; null when none was stored
 * @param snapshot the order as it stood after the event
 */
public record StoredEvent(
        long id,
        String orderId,
        long version,
        String event,
        String resultingState,
        int schemaVersion,
        boolean legacy,
        Command command,
        Order snapshot) {}
