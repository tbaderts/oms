// OutboxView.tsx - The Outbox tab (SPEC-0075): what waits to be published, and in which state.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OMSApiService } from '../services/OMSApiService';
import { dateTimeService } from '../services/DateTimeService';
import { OutboxMessageDetail, OutboxMessagePage, OutboxState, OutboxSummary } from '../types/types';
import JsonTree from './JsonTree';
import Icon from './icons/Icon';
import './Operations.scss';
import './OutboxView.scss';

const PAGE_SIZE = 50;

/** Class names per state, spelled out so the style rules can see them (SPEC-0058). */
const STATE_CLASS: Readonly<Record<OutboxState, string>> = {
  PENDING: 'ops-state ops-state--pending',
  STUCK: 'ops-state ops-state--stuck',
  HELD: 'ops-state ops-state--held',
};

/** An age in seconds, readably: "45 s", "12 min", "1 h 5 min", "2 d 3 h". */
export function formatAge(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/** The message type a row carries: a projection's record class (its simple name), else the aggregate type. */
const messageType = (aggregateType: string, payloadType?: string | null) =>
  payloadType ? payloadType.substring(payloadType.lastIndexOf('.') + 1) : aggregateType;

const when = (iso: string | null | undefined) => (iso ? dateTimeService.formatForDisplay(iso) || iso : '—');

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; summary: OutboxSummary; page: OutboxMessagePage };

type Detail =
  | { status: 'loading'; id: number }
  | { status: 'gone'; id: number }
  | { status: 'error'; id: number; message: string }
  | { status: 'loaded'; id: number; message: OutboxMessageDetail };

const Tile: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div role="group" aria-label={label} className={tone ? `ops-tile ${tone}` : 'ops-tile'}>
    <span className="ops-tile-label">{label}</span>
    <span className="ops-tile-value">{value}</span>
  </div>
);

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="ops-field">
    <dt>{label}</dt>
    <dd>{value ?? '—'}</dd>
  </div>
);

/** One message's fields, and its payload or what a pointer message points to. */
const MessageDetail: React.FC<{ detail: Detail; onClose: () => void }> = ({ detail, onClose }) => (
  <section className="ops-detail" aria-label={`Outbox message ${detail.id}`}>
    <div className="ops-detail-head">
      <h3>Message {detail.id}</h3>
      <button type="button" className="ops-button" onClick={onClose} aria-label="Close message">
        <Icon name="close" size={14} />
      </button>
    </div>
    {detail.status === 'loading' && <p className="ops-status" role="status">Loading message…</p>}
    {detail.status === 'gone' && (
      <p className="ops-status">Message {detail.id} is no longer in the outbox: it was published meanwhile.</p>
    )}
    {detail.status === 'error' && <p className="ops-error-text" role="alert">Could not load the message: {detail.message}</p>}
    {detail.status === 'loaded' && (
      <>
        <dl className="ops-fields">
          <Field label="State" value={<span className={STATE_CLASS[detail.message.state]}>{detail.message.state}</span>} />
          <Field label="Type" value={detail.message.aggregateType} />
          <Field label="Topic" value={detail.message.topic} />
          <Field label="Key" value={detail.message.key} />
          <Field label="Order" value={detail.message.orderId} />
          <Field label="Execution" value={detail.message.execId} />
          <Field label="Version" value={detail.message.aggregateVersion} />
          <Field label="Payload type" value={detail.message.payloadType} />
          <Field label="Created" value={when(detail.message.createdAt)} />
          <Field label="Attempts" value={`${detail.message.attempts} / ${detail.message.maxAttempts}`} />
        </dl>
        {detail.message.lastError && (
          <div className="ops-last-error">
            <span className="ops-tile-label">Last error</span>
            <pre>{detail.message.lastError}</pre>
          </div>
        )}
        {detail.message.payload != null ? (
          <JsonTree value={detail.message.payload} label="Payload" defaultExpanded />
        ) : detail.message.payloadError ? (
          <p className="ops-error-text">The payload could not be decoded: {detail.message.payloadError}</p>
        ) : (
          <p className="ops-help">
            This is a pointer message: its record is built at publish time from order {detail.message.orderId}
            {detail.message.execId ? `, execution ${detail.message.execId}` : ''}, version {detail.message.aggregateVersion}.
          </p>
        )}
      </>
    )}
  </section>
);

/**
 * The outbox: counts by state, the waiting messages (filtered and paged) and one message's detail.
 * Read-only; Refresh reloads. Stuck messages used up their attempts; held messages wait behind a
 * stuck message of their aggregate, so they are not published out of order.
 */
const OutboxView: React.FC = () => {
  const [state, setState] = useState<OutboxState | ''>('');
  const [pageNumber, setPageNumber] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [detail, setDetail] = useState<Detail | null>(null);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  // The message asked for last: an answer for any other is stale and dropped.
  const requested = useRef<number | null>(null);

  useEffect(() => {
    let current = true;
    setLoad((previous) => (previous.status === 'loaded' ? previous : { status: 'loading' }));
    (async () => {
      try {
        const api = await OMSApiService.getInstance();
        const [summary, page] = await Promise.all([
          api.getOutboxSummary(),
          api.getOutboxMessages(state || undefined, pageNumber, PAGE_SIZE),
        ]);
        if (current) setLoad({ status: 'loaded', summary, page });
      } catch (error) {
        if (current) setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      current = false;
    };
  }, [state, pageNumber, attempt]);

  const open = async (id: number) => {
    requested.current = id;
    setDetail({ status: 'loading', id });
    try {
      const api = await OMSApiService.getInstance();
      const message = await api.getOutboxMessage(id);
      if (requested.current === id) setDetail({ status: 'loaded', id, message });
    } catch (error: any) {
      if (requested.current !== id) return;
      if (error?.response?.status === 404) {
        setDetail({ status: 'gone', id });
      } else {
        setDetail({ status: 'error', id, message: error instanceof Error ? error.message : String(error) });
      }
    }
  };

  const summary = load.status === 'loaded' ? load.summary : null;
  const page = load.status === 'loaded' ? load.page : null;
  const outboxEmpty = summary != null && summary.pending + summary.stuck + summary.held === 0;

  return (
    <section className="ops-view outbox-view" aria-label="Outbox">
      <div className="ops-toolbar">
        <h2>Outbox</h2>
        <button type="button" className="ops-button" onClick={reload} aria-label="Refresh outbox">
          <Icon name="refresh" size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {load.status === 'error' && (
        <div className="ops-error" role="alert">
          <span>Could not load the outbox: {load.message}</span>
          <button type="button" className="ops-button" onClick={reload}>Retry</button>
        </div>
      )}
      {load.status === 'loading' && <p className="ops-status" role="status">Loading the outbox…</p>}

      {summary && (
        <>
          <div className="ops-tiles">
            <Tile label="Pending" value={summary.pending} />
            <Tile label="Stuck" value={summary.stuck} tone={summary.stuck > 0 ? 'ops-tile--alert' : undefined} />
            <Tile label="Held" value={summary.held} tone={summary.held > 0 ? 'ops-tile--warn' : undefined} />
            <Tile label="Oldest waiting" value={formatAge(summary.oldestWaitingAgeSeconds)} />
          </div>
          <p className="ops-help">
            <strong>Pending</strong> messages are being published and retried as usual. A <strong>stuck</strong> message
            used up its {summary.maxAttempts} attempts and is no longer retried. A <strong>held</strong> message waits
            behind a stuck message of the same topic and key, so that it is not published out of order. (The
            <code>oms.outbox.pending</code> gauge counts every waiting message, stuck and held included.)
          </p>
        </>
      )}

      {page && (
        <>
          <div className="ops-filter">
            <label htmlFor="outbox-state">State</label>
            <select
              id="outbox-state"
              value={state}
              onChange={(e) => {
                setState(e.target.value as OutboxState | '');
                setPageNumber(0);
              }}
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="STUCK">Stuck</option>
              <option value="HELD">Held</option>
            </select>
          </div>

          {page.content.length === 0 ? (
            <p className="ops-status">
              {outboxEmpty && !state
                ? 'Outbox is empty: every message has been published'
                : `No ${state ? state.toLowerCase() : ''} messages`}
            </p>
          ) : (
            <table className="ops-table">
              <thead>
                <tr>
                  <th scope="col">State</th>
                  <th scope="col">Id</th>
                  <th scope="col">Topic</th>
                  <th scope="col">Key</th>
                  <th scope="col">Order</th>
                  <th scope="col">Exec</th>
                  <th scope="col">Type</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Created</th>
                  <th scope="col">Last error</th>
                </tr>
              </thead>
              <tbody>
                {page.content.map((m) => (
                  <tr key={m.id} className="outbox-row">
                    <td><span className={STATE_CLASS[m.state]}>{m.state}</span></td>
                    <td>
                      <button type="button" className="ops-link" onClick={() => open(m.id)} aria-label={`Open message ${m.id}`}>
                        {m.id}
                      </button>
                    </td>
                    <td>{m.topic}</td>
                    <td><span className="outbox-key">{m.key}</span></td>
                    <td>{m.orderId ?? '—'}</td>
                    <td>{m.execId ?? '—'}</td>
                    <td>
                      <span title={m.payloadType ? `${m.aggregateType}: ${m.payloadType}` : m.aggregateType}>
                        {messageType(m.aggregateType, m.payloadType)}
                      </span>
                    </td>
                    <td className="ops-number">{`${m.attempts} / ${m.maxAttempts}`}</td>
                    <td>{when(m.createdAt)}</td>
                    <td className="ops-error-cell">{m.lastError ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {page.page.totalPages > 1 && (
            <div className="ops-pager">
              <button type="button" className="ops-button" aria-label="Previous page" disabled={pageNumber === 0}
                onClick={() => setPageNumber((n) => Math.max(0, n - 1))}>‹</button>
              <span>{`Page ${page.page.number + 1} of ${page.page.totalPages}`}</span>
              <button type="button" className="ops-button" aria-label="Next page"
                disabled={pageNumber + 1 >= page.page.totalPages}
                onClick={() => setPageNumber((n) => n + 1)}>›</button>
            </div>
          )}
        </>
      )}

      {detail && (
        <MessageDetail
          detail={detail}
          onClose={() => {
            requested.current = null;
            setDetail(null);
          }}
        />
      )}
    </section>
  );
};

export default OutboxView;
