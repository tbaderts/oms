import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { decodeToolText } from '@shared/mcpText';
import { sourceDetails, summarise, type KbChatStep, type KbChatTrace, type SourceDetail, type SourceMatch } from '@/lib/kbChatTrace';

/**
 * An answer's source details, shown in its Sources list, and its "Run details" (SPEC-0065): why
 * each document was cited, and what the run did. The toggles are closed by default and render
 * nothing until opened. Tool output is shown as text, never as HTML or Markdown.
 */

function Section({ title, testId, children }: { title: string; testId: string; children: () => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Icon className="h-3 w-3" />
        {title}
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-border p-2 text-xs" data-testid={testId}>
          {children()}
        </div>
      )}
    </div>
  );
}

const joined = (parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ');
/** A score to 3 significant digits (0.0325, 0.123), without trailing zeros. */
const round = (v: number) => String(Number(v.toPrecision(3)));

/**
 * The knowledge server's fused score is higher-is-better; the local search's is a fuzzy-match
 * distance, lower-is-better, so it is named for what it is.
 */
function scoreText(m: Extract<SourceMatch, { kind: 'search' }>): string | undefined {
  if (m.score === undefined) return undefined;
  return 'category' in m ? `distance ${round(m.score)} (lower is better)` : `score ${round(m.score)}`;
}

function matchLine(m: SourceMatch): React.ReactNode {
  if (m.kind === 'read') return <span>read{m.anchor ? ` #${m.anchor}` : ''}</span>;
  const head = joined([
    `#${m.rank} for "${m.query ?? '?'}"`,
    scoreText(m),
    'keywordRank' in m && m.keywordRank !== undefined && `keyword #${m.keywordRank}`,
    'semanticRank' in m && m.semanticRank !== undefined && `semantic #${m.semanticRank}`,
    'category' in m && m.category,
  ]);
  const server = 'breadcrumb' in m || 'anchor' in m ? (m as Extract<SourceMatch, { breadcrumb?: string }>) : null;
  const section = server && joined([
    server.breadcrumb,
    server.anchor && `#${server.anchor}`,
    server.lines && `lines ${server.lines}`,
    server.facets,
  ]);
  return (
    <>
      <span>{head}</span>
      {section && <div className="text-muted-foreground">{section}</div>}
      {server?.excerpt && <div className="whitespace-pre-wrap border-l-2 border-border pl-2 text-muted-foreground">{server.excerpt}</div>}
    </>
  );
}

/** The source details of an answer by document path (SPEC-0065). */
export function sourceDetailsByPath(trace: KbChatTrace | undefined): Map<string, SourceDetail> {
  return new Map((trace ? sourceDetails(trace.steps) : []).map((d) => [d.path, d]));
}

/** The match a source is best known by: the search with the lowest rank, else the first read. */
function bestMatch(detail: SourceDetail): SourceMatch {
  const searches = detail.matches.filter((m) => m.kind === 'search') as Extract<SourceMatch, { kind: 'search'; rank: number }>[];
  return searches.length ? searches.reduce((a, b) => (b.rank < a.rank ? b : a)) : detail.matches[0];
}

/** The last segment of a breadcrumb ("file.md > Order Cancellation > Summary" → "Summary"). */
const lastSegment = (breadcrumb: string) => breadcrumb.split(/\s+[>›]\s+/).pop() ?? breadcrumb;

/** One line: "#1 · score 0.0325 · Summary (lines 18-28) · Capability · draft · unverified". */
function summaryOf(m: SourceMatch): string {
  if (m.kind === 'read') return `read${m.anchor ? ` #${m.anchor}` : ''}`;
  const server = 'breadcrumb' in m || 'lines' in m ? (m as Extract<SourceMatch, { breadcrumb?: string }>) : null;
  const section = server?.breadcrumb ? `${lastSegment(server.breadcrumb)}${server.lines ? ` (lines ${server.lines})` : ''}` : undefined;
  return joined([`#${m.rank}`, scoreText(m), section, server?.facets]);
}

/**
 * What the Sources list adds after a source's link (SPEC-0065): a summary of its best match, and a
 * toggle, closed by default, that lists every match with its query, ranks, section and excerpt.
 */
export function SourceEntryDetails({ path, detail }: { path: string; detail?: SourceDetail }) {
  const [open, setOpen] = useState(false);
  if (!detail?.matches.length) return null;
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <>
      <span className="text-xs text-muted-foreground">{summaryOf(bestMatch(detail))}</span>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Show matches for ${path}`}
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Icon className="h-3 w-3" />
      </button>
      {open && (
        <ul className="ml-4 mt-0.5 w-full space-y-1 rounded-md border border-border p-2 text-xs" data-testid="kb-chat-source-matches">
          {detail.matches.map((m, i) => (
            <li key={i}>{matchLine(m)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

const OUTCOME: Record<KbChatTrace['outcome'], string> = {
  running: 'running',
  complete: 'complete',
  stopped: 'stopped',
  'step-limit': 'step limit',
  failed: 'failed',
};

const n = (v: number) => v.toLocaleString('en-US');

function summaryLine(trace: KbChatTrace): string {
  const { toolCalls, durationMs, totalTokens } = summarise(trace);
  return joined([
    trace.model ? `${trace.model.provider} / ${trace.model.model}` : 'model not reported',
    trace.usage
      ? `${n(trace.usage.inputTokens)} in + ${n(trace.usage.outputTokens)} out = ${n(totalTokens!)} tokens`
      : 'tokens not reported',
    `${toolCalls} tool ${toolCalls === 1 ? 'call' : 'calls'}`,
    durationMs !== undefined && `${(durationMs / 1000).toFixed(1)} s`,
    trace.outcome === 'failed' && trace.error ? `failed: ${trace.error}` : OUTCOME[trace.outcome],
  ]);
}

const TEXT_PREVIEW = 300;

function TextStep({ text }: { text: string }) {
  const [full, setFull] = useState(false);
  const long = text.length > TEXT_PREVIEW;
  return (
    <span className="whitespace-pre-wrap text-muted-foreground">
      {full || !long ? text : `${text.slice(0, TEXT_PREVIEW)}…`}
      {long && (
        <button type="button" className="ml-1 text-primary hover:underline" onClick={() => setFull(!full)}>
          {full ? 'less' : 'more'}
        </button>
      )}
    </span>
  );
}

function ToolStep({ step }: { step: Extract<KbChatStep, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <code className="break-all">{`${step.name}(${JSON.stringify(step.input)})`}</code>
      {step.output !== undefined ? (
        <>
          <button type="button" aria-expanded={open} className="ml-2 text-primary hover:underline" onClick={() => setOpen(!open)}>
            Result
          </button>
          {open && <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">{decodeToolText(step.output)}</pre>}
        </>
      ) : (
        <span className="ml-2 text-muted-foreground">no result</span>
      )}
    </>
  );
}

export function RunDetails({ trace }: { trace: KbChatTrace }) {
  return (
    <Section title="Run details" testId="kb-chat-run-details">
      {() => (
        <>
          <p className="mb-1 font-medium">{summaryLine(trace)}</p>
          <ol className="list-decimal space-y-1 pl-4">
            {trace.steps.map((s, i) => (
              <li key={i}>{s.kind === 'text' ? <TextStep text={s.text} /> : <ToolStep step={s} />}</li>
            ))}
          </ol>
        </>
      )}
    </Section>
  );
}
