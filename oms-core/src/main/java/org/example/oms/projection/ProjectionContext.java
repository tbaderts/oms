package org.example.oms.projection;

import java.time.Instant;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.example.common.model.cmd.Command;

/**
 * One change a projection derives its rows and messages from (SPEC-0020).
 *
 * @param order the order after the change
 * @param execution the fill that caused it
 * @param orderVersion the event-log version the change was recorded at
 * @param command the command that caused it; null for fills recorded without their command
 * @param stagedAt when the change was recorded: now in the command transaction, the event's time in a
 *     rebuild
 */
public record ProjectionContext(
        Order order, Execution execution, long orderVersion, Command command, Instant stagedAt) {}
