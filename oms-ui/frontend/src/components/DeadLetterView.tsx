// DeadLetterView.tsx - The Dead letters tab (SPEC-0075): what the command listener could not process.
import React, { useCallback, useEffect, useState } from 'react';
import { OMSApiService } from '../services/OMSApiService';
import { dateTimeService } from '../services/DateTimeService';
import { DeadLetterRecord, DeadLetterTopic } from '../types/types';
import JsonTree from './JsonTree';
import Icon from './icons/Icon';
import './Operations.scss';
import './DeadLetterView.scss';

const LIMIT = 50;

const when = (iso: string | null | undefined) => (iso ? dateTimeService.formatForDisplay(iso) || iso : '—');

/** The class's own name: "ListenerExecutionFailedException" for the fully qualified one. */
const simpleName = (fqcn: string | null | undefined) => (fqcn ? fqcn.substring(fqcn.lastIndexOf('.') + 1) : '—');

/** oms-core's problem detail when there is one (a 503 names the Kafka failure), else the error's message. */
const describe = (error: any): string =>
  error?.response?.data?.detail ?? (error instanceof Error ? error.message : String(error));

const recordId = (r: DeadLetterRecord) => `${r.partition}/${r.offset}`;

const original = (r: DeadLetterRecord) =>
  r.originalTopic ? `${r.originalTopic} ${r.originalPartition ?? '?'}@${r.originalOffset ?? '?'}` : '—';

type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'loaded'; data: T };

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="ops-field">
    <dt>{label}</dt>
    <dd>{value ?? '—'}</dd>
  </div>
);

/** One dead letter: where it came from, why it failed, its value decoded and every header. */
const RecordDetail: React.FC<{ record: DeadLetterRecord; onClose: () => void }> = ({ record, onClose }) => (
  <section className="ops-detail" aria-label={`Dead letter ${recordId(record)}`}>
    <div className="ops-detail-head">
      <h3>{`${record.topic} ${recordId(record)}`}</h3>
      <button type="button" className="ops-button" onClick={onClose} aria-label="Close record">
        <Icon name="close" size={14} />
      </button>
    </div>
    <dl className="ops-fields">
      <Field label="Dead-lettered" value={when(record.timestamp)} />
      <Field label="Key" value={record.key} />
      <Field label="Original" value={original(record)} />
      <Field label="Originally sent" value={when(record.originalTimestamp)} />
      <Field label="Exception" value={record.exceptionClass} />
      <Field label="Cause" value={record.causeClass} />
      <Field label="Value" value={record.payloadFormat} />
    </dl>
    {record.exceptionMessage && (
      <div className="ops-last-error">
        <span className="ops-tile-label">Message</span>
        <pre>{record.exceptionMessage}</pre>
      </div>
    )}
    {record.payloadFormat === 'AVRO' && record.payload != null && (
      <JsonTree value={record.payload} label="Payload" defaultExpanded />
    )}
    {(record.payloadFormat === 'TEXT' || record.payloadFormat === 'BINARY') && (
      <div className="dlt-value">
        <span className="ops-tile-label">{record.payloadFormat === 'TEXT' ? 'Value (text)' : 'Value (hex)'}</span>
        <pre>{record.payloadText}</pre>
      </div>
    )}
    {record.payloadFormat === 'EMPTY' && <p className="ops-help">The record has no value.</p>}
    {record.payloadError && <p className="ops-error-text">The value could not be decoded: {record.payloadError}</p>}
    {record.headers && Object.keys(record.headers).length > 0 && (
      <table className="ops-table dlt-headers">
        <caption>Headers</caption>
        <tbody>
          {Object.entries(record.headers).map(([key, value]) => (
            <tr key={key}>
              <th scope="row">{key}</th>
              <td><pre>{value}</pre></td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
);

/**
 * The dead-letter topics and the latest records of the selected one, read without consuming them.
 * Read-only; Refresh reloads. Resending is a later ticket.
 */
const DeadLetterView: React.FC = () => {
  const [attempt, setAttempt] = useState(0);
  const [topics, setTopics] = useState<Load<DeadLetterTopic[]>>({ status: 'loading' });
  const [selected, setSelected] = useState<string | null>(null);
  const [records, setRecords] = useState<Load<DeadLetterRecord[]> | null>(null);
  const [open, setOpen] = useState<DeadLetterRecord | null>(null);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const api = await OMSApiService.getInstance();
        const list = await api.getDeadLetterTopics();
        if (!current) return;
        setTopics({ status: 'loaded', data: list });
        setSelected((previous) =>
          previous && list.some((t) => t.topic === previous)
            ? previous
            : (list.find((t) => t.records > 0) ?? list[0])?.topic ?? null);
      } catch (error) {
        if (current) setTopics({ status: 'error', message: describe(error) });
      }
    })();
    return () => {
      current = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!selected) {
      setRecords(null);
      return undefined;
    }
    let current = true;
    setRecords((previous) => (previous?.status === 'loaded' ? previous : { status: 'loading' }));
    (async () => {
      try {
        const api = await OMSApiService.getInstance();
        const data = await api.getDeadLetterRecords(selected, LIMIT);
        if (current) setRecords({ status: 'loaded', data });
      } catch (error) {
        if (current) setRecords({ status: 'error', message: describe(error) });
      }
    })();
    return () => {
      current = false;
    };
  }, [selected, attempt]);

  const select = (topic: string) => {
    setOpen(null);
    setRecords({ status: 'loading' });
    setSelected(topic);
  };

  const error = topics.status === 'error' ? topics.message : records?.status === 'error' ? records.message : null;

  return (
    <section className="ops-view dlt-view" aria-label="Dead letters">
      <div className="ops-toolbar">
        <h2>Dead letters</h2>
        <button type="button" className="ops-button" onClick={reload} aria-label="Refresh dead letters">
          <Icon name="refresh" size={14} />
          <span>Refresh</span>
        </button>
      </div>
      <p className="ops-help">
        Commands the command listener could not process, after its retries (or at once, when a command cannot be read),
        on <code>&lt;topic&gt;.DLT</code>. Shown without consuming them; the latest {LIMIT} of the selected topic.
      </p>

      {error && (
        <div className="ops-error" role="alert">
          <span>Could not load the dead letters: {error}</span>
          <button type="button" className="ops-button" onClick={reload}>Retry</button>
        </div>
      )}
      {topics.status === 'loading' && <p className="ops-status" role="status">Loading dead-letter topics…</p>}

      {topics.status === 'loaded' && topics.data.length === 0 && (
        <p className="ops-status">No dead-letter topics: nothing has been dead-lettered</p>
      )}

      {topics.status === 'loaded' && topics.data.length > 0 && (
        <ul className="dlt-topics">
          {topics.data.map((t) => (
            <li key={t.topic}>
              <button
                type="button"
                className={t.topic === selected ? 'dlt-topic dlt-topic--selected' : 'dlt-topic'}
                aria-pressed={t.topic === selected}
                onClick={() => select(t.topic)}
              >
                <span className="dlt-topic-name">{t.topic}</span>
                <span className="dlt-topic-count">{`${t.records} records`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && records?.status === 'loading' && <p className="ops-status" role="status">Loading records…</p>}
      {selected && records?.status === 'loaded' && records.data.length === 0 && (
        <p className="ops-status">{`No records on ${selected}`}</p>
      )}
      {selected && records?.status === 'loaded' && records.data.length > 0 && (
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">Record</th>
              <th scope="col">Dead-lettered</th>
              <th scope="col">Key</th>
              <th scope="col">Original</th>
              <th scope="col">Exception</th>
              <th scope="col">Message</th>
            </tr>
          </thead>
          <tbody>
            {records.data.map((r) => (
              <tr key={recordId(r)} className="dlt-row">
                <td>
                  <button type="button" className="ops-link" onClick={() => setOpen(r)} aria-label={`Open record ${recordId(r)}`}>
                    {recordId(r)}
                  </button>
                </td>
                <td>{when(r.timestamp)}</td>
                <td>{r.key ?? '—'}</td>
                <td>{original(r)}</td>
                <td title={r.exceptionClass ?? undefined}>{simpleName(r.exceptionClass)}</td>
                <td className="ops-error-cell">{r.exceptionMessage ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && <RecordDetail record={open} onClose={() => setOpen(null)} />}
    </section>
  );
};

export default DeadLetterView;
