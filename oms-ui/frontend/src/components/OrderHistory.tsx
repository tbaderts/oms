// OrderHistory.tsx - The order's command and event history, as one timeline (SPEC-0074).
// Event log and command log come from oms-core's query API (SPEC-0049); buildTimeline joins them.
import React, { useCallback, useEffect, useState } from 'react';
import { OMSApiService } from '../services/OMSApiService';
import { buildTimeline, TimelineEntry } from '../services/orderHistory';
import { dateTimeService } from '../services/DateTimeService';
import { CommandLogEntry, OrderEventEntry } from '../types/types';
import { formatFieldValue } from './FieldValue';
import JsonTree from './JsonTree';
import Icon from './icons/Icon';
import './OrderHistory.scss';

interface OrderHistoryProps {
  /** The business order id. */
  orderId: string;
}

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded' };

/** Class names per command outcome, spelled out so the style rules can see them (SPEC-0058). */
const ENTRY_CLASS: Readonly<Record<string, string>> = {
  APPLIED: 'history-entry history-entry--applied',
  REFUSED: 'history-entry history-entry--refused',
  FAILED: 'history-entry history-entry--failed',
};
const OUTCOME_CLASS: Readonly<Record<string, string>> = {
  APPLIED: 'history-outcome history-outcome--applied',
  REFUSED: 'history-outcome history-outcome--refused',
  FAILED: 'history-outcome history-outcome--failed',
};
const entryClass = (outcome: string) => ENTRY_CLASS[outcome] ?? 'history-entry';
const outcomeClass = (outcome: string) => OUTCOME_CLASS[outcome] ?? 'history-outcome';

const when = (iso: string | null | undefined) =>
  iso ? <time dateTime={iso}>{dateTimeService.formatForDisplay(iso) || iso}</time> : null;

/** Who and where: the source and the principal, when known. */
const Origin: React.FC<{ source?: string | null; principal?: string | null }> = ({ source, principal }) => (
  <>
    {source && <span className="history-source" title="Source">{source}</span>}
    {principal && <span className="history-principal" title="Principal">{principal}</span>}
  </>
);

/** The fields an event changed, as old → new; an absent old value (a first event) stays empty, a cleared new value shows "—". */
const ChangesList: React.FC<{ changes: NonNullable<OrderEventEntry['changes']> }> = ({ changes }) => {
  const fields = Object.keys(changes);
  if (fields.length === 0) return null;
  return (
    <table className="history-changes">
      <caption className="visually-hidden">Changed fields</caption>
      <tbody>
        {fields.map((field) => {
          const { from, to } = changes[field] ?? {};
          return (
            <tr key={field} className="change-row">
              <th scope="row" className="change-field">{field}</th>
              <td className="change-from">{from == null ? '' : formatFieldValue(field, from, 'Order')}</td>
              <td className="change-arrow" aria-label="changed to">→</td>
              {/* a field the change cleared shows the detail panel's empty value */}
              <td className="change-to">{formatFieldValue(field, to, 'Order')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const EventEntry: React.FC<{ event: OrderEventEntry; command?: CommandLogEntry }> = ({ event, command }) => (
  <li className="history-entry history-entry--event">
    <div className="history-entry-head">
      <span className="history-version">{`v${event.version}`}</span>
      <span className="history-event">{event.event}</span>
      {event.resultingState && formatFieldValue('state', event.resultingState, 'Order')}
      <span className="history-time">{when(event.timeStamp)}</span>
    </div>
    <div className="history-meta">
      {command && (
        <span className="history-command">
          <span className="history-command-type">{command.type}</span>
          <span className={outcomeClass(command.outcome)}>{command.outcome}</span>
        </span>
      )}
      <Origin source={event.source} principal={event.principal} />
    </div>
    {event.changes && <ChangesList changes={event.changes} />}
    <div className="history-json">
      {event.transaction != null && <JsonTree value={event.transaction} label="Command" />}
      {event.orderSnapshot != null && <JsonTree value={event.orderSnapshot} label="Order snapshot" />}
    </div>
  </li>
);

/** A command that changed nothing: refused, failed, or applied without an event on record. */
const CommandEntry: React.FC<{ command: CommandLogEntry }> = ({ command }) => (
  <li className={entryClass(command.outcome)}>
    <div className="history-entry-head">
      <span className="history-command-type">{command.type}</span>
      <span className={outcomeClass(command.outcome)}>{command.outcome}</span>
      <span className="history-time">{when(command.receivedAt)}</span>
    </div>
    {command.reason && <div className="history-reason">{command.reason}</div>}
    <div className="history-meta">
      <Origin source={command.source} principal={command.principal} />
    </div>
  </li>
);

/**
 * The order's history, oldest first: each change with the command that caused it, and the commands
 * that were refused or failed. Fetched when shown; Refresh fetches again.
 */
const OrderHistory: React.FC<OrderHistoryProps> = ({ orderId }) => {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  // The last history loaded: it stays in view while a refresh loads, so expanded entries keep
  // their state and nothing flashes.
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let current = true;
    setLoad({ status: 'loading' });
    (async () => {
      try {
        const api = await OMSApiService.getInstance();
        const [events, commands] = await Promise.all([api.getOrderEvents(orderId), api.getOrderCommands(orderId)]);
        if (current) {
          setTimeline(buildTimeline(events, commands));
          setLoad({ status: 'loaded' });
        }
      } catch (error) {
        if (current) setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      current = false;
    };
  }, [orderId, attempt]);

  return (
    <section className="order-history" aria-label="Order history">
      <div className="order-history-toolbar">
        <span className="order-history-title">Commands and events, oldest first</span>
        <button type="button" className="order-history-refresh" onClick={reload} aria-label="Refresh history"
          disabled={load.status === 'loading'}>
          <Icon name="refresh" size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {load.status === 'loading' && (
        <p className="order-history-status" role="status">{timeline ? 'Refreshing…' : 'Loading history…'}</p>
      )}

      {load.status === 'error' && (
        <div className="order-history-error" role="alert">
          <span>Could not load the history: {load.message}</span>
          <button type="button" onClick={reload}>Retry</button>
        </div>
      )}

      {load.status === 'loaded' && timeline?.length === 0 && (
        <p className="order-history-status">No history recorded for this order</p>
      )}

      {timeline && timeline.length > 0 && (
        <ol className="history-list">
          {timeline.map((entry, i) =>
            entry.kind === 'event'
              ? <EventEntry key={`e${entry.event.version}`} event={entry.event} command={entry.command} />
              : <CommandEntry key={`c${i}-${entry.command.commandId ?? entry.command.receivedAt}`} command={entry.command} />)}
        </ol>
      )}
    </section>
  );
};

export default OrderHistory;
