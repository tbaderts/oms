// orderHistory.ts - One timeline from an order's event log and command log (SPEC-0074)
import { CommandLogEntry, OrderEventEntry } from '../types/types';

/** An entry of the History view: a change (with the command that caused it), or a command that changed nothing. */
export type TimelineEntry =
  | { kind: 'event'; event: OrderEventEntry; command?: CommandLogEntry }
  | { kind: 'command'; command: CommandLogEntry };

const time = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

/**
 * The order's history, oldest first.
 *
 * - Events stay in ascending version, the order in which the changes happened.
 * - An applied command joins the event it appended: by `eventVersion`, or else by `commandId`. It is
 *   then shown on that event, not as an entry of its own.
 * - Every other command (refused, failed, or applied without a matching event) is an entry of its
 *   own, placed before the first event recorded after it was received.
 */
export function buildTimeline(events: OrderEventEntry[], commands: CommandLogEntry[]): TimelineEntry[] {
  const sorted = [...events].sort((a, b) => a.version - b.version);
  const byVersion = new Map(sorted.map((e) => [e.version, e]));
  const byCommandId = new Map(sorted.filter((e) => e.commandId).map((e) => [e.commandId as string, e]));

  const joined = new Map<OrderEventEntry, CommandLogEntry>();
  const unjoined: CommandLogEntry[] = [];
  for (const command of commands) {
    let target: OrderEventEntry | undefined;
    if (command.eventVersion != null) {
      target = byVersion.get(command.eventVersion);
    } else if (command.outcome === 'APPLIED' && command.commandId) {
      target = byCommandId.get(command.commandId);
    }
    if (target && !joined.has(target)) {
      joined.set(target, command);
    } else {
      unjoined.push(command);
    }
  }

  const timeline: TimelineEntry[] = [];
  let next = 0; // the next unjoined command to place
  for (const event of sorted) {
    const eventTime = time(event.timeStamp);
    while (next < unjoined.length && time(unjoined[next].receivedAt) < eventTime) {
      timeline.push({ kind: 'command', command: unjoined[next++] });
    }
    const command = joined.get(event);
    timeline.push(command ? { kind: 'event', event, command } : { kind: 'event', event });
  }
  while (next < unjoined.length) {
    timeline.push({ kind: 'command', command: unjoined[next++] });
  }
  return timeline;
}
