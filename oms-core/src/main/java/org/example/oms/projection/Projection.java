package org.example.oms.projection;

import java.util.List;

/**
 * A read model derived from order changes inside the command transaction (SPEC-0020).
 *
 * <p>Every projection bean runs for every applied fill ({@code ProjectTask}), so its rows are
 * consistent with the order by construction. Because it is computed from an order snapshot and a
 * fill only, it can be rebuilt from {@code order_events} and {@code executions} at any time
 * ({@link ProjectionRebuilder}).
 */
public interface Projection {

    /** The projection's table name; also its name for a rebuild. */
    String name();

    /**
     * Writes this projection's rows for the change (upserting by its natural key) and returns the
     * messages to stage. Throwing fails the command, which then rolls back.
     */
    List<StagedMessage> project(ProjectionContext context);

    /** Deletes all of this projection's rows, before a rebuild. */
    void clear();
}
