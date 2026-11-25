// JsonTree.tsx - A JSON value as an indented, collapsible tree (SPEC-0074).
// Values render as text nodes, never as markup, so payload content cannot inject HTML.
import React, { useState } from 'react';
import './JsonTree.scss';

type Json = unknown;

const isContainer = (value: Json): value is Record<string, unknown> | unknown[] =>
  value !== null && typeof value === 'object';

const sizeHint = (value: Record<string, unknown> | unknown[]) =>
  Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;

const Leaf: React.FC<{ value: Json }> = ({ value }) => {
  if (value === null || value === undefined) return <span className="json-null">null</span>;
  // as JSON text, so embedded quotes and line breaks read unambiguously
  if (typeof value === 'string') return <span className="json-string">{JSON.stringify(value)}</span>;
  if (typeof value === 'number') return <span className="json-number">{String(value)}</span>;
  if (typeof value === 'boolean') return <span className="json-boolean">{String(value)}</span>;
  return <span className="json-string">{String(value)}</span>;
};

const Node: React.FC<{ name: string; value: Json; defaultExpanded?: boolean }> = ({ name, value, defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!isContainer(value)) {
    return (
      <div className="json-row">
        <span className="json-key">{name}</span>
        <span className="json-punct">: </span>
        <Leaf value={value} />
      </div>
    );
  }

  const entries: Array<[string, Json]> = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);

  return (
    <div className="json-node">
      <button
        type="button"
        className="json-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`json-caret${expanded ? ' open' : ''}`} aria-hidden="true">▸</span>
        <span className="json-key">{name}</span>
        <span className="json-size">{sizeHint(value)}</span>
      </button>
      {expanded && (
        <div className="json-children">
          {entries.length === 0
            ? <div className="json-row json-empty">{Array.isArray(value) ? 'empty array' : 'empty object'}</div>
            : entries.map(([key, child]) => <Node key={key} name={key} value={child} />)}
        </div>
      )}
    </div>
  );
};

interface JsonTreeProps {
  value: Json;
  /** The root's name, e.g. "Command" or "Order snapshot". */
  label: string;
  /** Show the root's own fields at once; nested objects and arrays stay collapsed. */
  defaultExpanded?: boolean;
}

/** A JSON value as a tree: typed leaves, collapsible objects and arrays, and a copy action for the raw JSON. */
const JsonTree: React.FC<JsonTreeProps> = ({ value, label, defaultExpanded = false }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="json-tree">
      <div className="json-tree-header">
        <Node name={label} value={value} defaultExpanded={defaultExpanded} />
        <button type="button" className="json-copy" onClick={copy}>
          Copy JSON
        </button>
        {copyState !== 'idle' && (
          <span className={`json-copy-status ${copyState}`} role="status">
            {copyState === 'copied' ? 'Copied' : 'Copy failed'}
          </span>
        )}
      </div>
    </div>
  );
};

export default JsonTree;
