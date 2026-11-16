import React from 'react';
import { Badge } from '@/components/ui/badge';

/** Keys shown in their own place; every other key goes to the "Other metadata" list. */
const SHOWN = new Set(['title', 'type', 'status', 'updated', 'description', 'tags', 'sources', 'aliases', 'superseded_by']);
const REPO = 'repo:';

/** A date-like value as YYYY-MM-DD (quoted ISO strings and Dates from unquoted YAML alike). */
function asDay(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

/** Any front matter value as text: scalars as they are, lists joined, objects as compact JSON. */
function asText(value: unknown): string {
  const day = value instanceof Date ? asDay(value) : null;
  if (day) return day;
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

function statusVariant(status: string): 'destructive' | 'outline' | 'secondary' {
  if (status === 'deprecated') return 'destructive';
  if (status === 'draft') return 'outline';
  return 'secondary';
}

/** A source entry: a `repo:` path as code, any other resource as given (SPEC-0064). */
function Source({ source }: { source: unknown }) {
  const resource = typeof source === 'object' && source !== null ? (source as { resource?: unknown }).resource : source;
  if (typeof resource === 'string' && resource.startsWith(REPO)) {
    return <code className="text-xs">{resource.slice(REPO.length)}</code>;
  }
  return <span className="break-all">{asText(resource)}</span>;
}

/**
 * The OKF front matter of a knowledge base document (SPEC-0064): type, status, updated, the
 * description, tags, sources, aliases and superseded_by, then every other key. Nothing without
 * front matter.
 */
export function FrontMatterPanel({ frontmatter }: { frontmatter: Record<string, unknown> }) {
  const keys = Object.keys(frontmatter ?? {});
  if (!keys.length) return null;
  const fm = frontmatter;
  const status = typeof fm.status === 'string' ? fm.status : null;
  // A malformed value is shown as written rather than hidden.
  const updated = fm.updated === undefined || fm.updated === null ? null : asDay(fm.updated) ?? asText(fm.updated);
  const tags = list(fm.tags);
  const sources = list(fm.sources);
  const aliases = list(fm.aliases);
  const others = keys.filter((k) => !SHOWN.has(k));

  return (
    <section aria-label="Document metadata" className="mt-3 space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {fm.type !== undefined && <Badge variant="secondary">{asText(fm.type)}</Badge>}
        {status && (
          <Badge variant={statusVariant(status)} data-status={status} data-variant={statusVariant(status)}>
            {status}
          </Badge>
        )}
        {updated && <span className="text-xs text-muted-foreground">Updated {updated}</span>}
      </div>

      {fm.description !== undefined && <p className="text-muted-foreground">{asText(fm.description)}</p>}

      {fm.superseded_by !== undefined && (
        <p className="text-xs">
          Superseded by <code>{asText(fm.superseded_by)}</code>
        </p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Tags">
          {tags.map((t, i) => (
            <Badge key={i} variant="outline" className="text-[10px]">
              {asText(t)}
            </Badge>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground">Sources</div>
          <ul className="ml-4 list-disc text-xs">
            {sources.map((s, i) => (
              <li key={i}>
                <Source source={s} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {aliases.length > 0 && (
        <div className="text-xs">
          <span className="font-medium text-muted-foreground">Former ids </span>
          {aliases.map((a, i) => (
            <React.Fragment key={i}>
              {i > 0 && ', '}
              <code>{asText(a)}</code>
            </React.Fragment>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <dl aria-label="Other metadata" role="list" className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          {others.map((k) => (
            <React.Fragment key={k}>
              <dt className="font-medium text-muted-foreground">{k}</dt>
              <dd className="break-all">{asText(fm[k])}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </section>
  );
}
