package org.example.oms.projection;

import java.util.List;

/**
 * A read model derived from order changes inside the command transaction (SPEC-0020).
 *
 * <p>Every projection bean runs for every applied fill ({@code ProjectTask}), so its rows are
 * consistent with the order by construction. Because it is computed from an order snapshot and a
 * fill only, it can be rebuilt from {@code order_events} and {@code executions} at any time
 * ({@link ProjectionRebuilder}).
 *
 * <p>Naming rule (SPEC-0045): a projection's name is its subject, such as {@code order_execution},
 * and its rows live in the table {@code <name>_projection}. The name is what operators and metrics
 * see; the table is what SQL sees.
 */
public interface Projection {

    /** The projection's name: the rebuild selector and the metric tag, e.g. {@code order_execution}. */
    String name();

    /**
     * The table holding its rows, {@code name() + "_projection"} by convention. The rebuild locks it.
     * Must be a constant, never derived from a request.
     */
    String table();

    /**
     * Writes this projection's rows for the change (upserting by its natural key) and returns the
     * messages to stage. Throwing fails the command, which then rolls back.
     */
    List<StagedMessage> project(ProjectionContext context);

    /** Deletes all of this projection's rows, before a rebuild. */
    void clear();
}
