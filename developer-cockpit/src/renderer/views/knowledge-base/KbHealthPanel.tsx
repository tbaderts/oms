import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { KbFinding, KbHealthReport, KbIndexChange } from '@shared/types/kb';

interface KbHealthPanelProps {
  /** Opens a document by its path relative to the knowledge base; false when there is no such document. */
  onOpenDocument: (relativePath: string) => boolean | void | Promise<boolean | void>;
  /** Called after the index fix wrote files, so the explorer reloads its tree. */
  onIndexesFixed: () => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function StatTable({ title, counts }: { title: string; counts: Record<string, number> }) {
  const rows = Object.entries(counts);
  if (!rows.length) return null;
  return (
    <table aria-label={title} className="w-full text-xs">
      <caption className="pb-1 text-left font-medium text-muted-foreground">{title}</caption>
      <tbody>
        {rows.map(([key, n]) => (
          <tr key={key} className="border-t border-border">
            <td className="py-0.5">{key}</td>
            <td className="py-0.5 text-right tabular-nums">{n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Findings by rule, errors first, then by rule name. */
function groupFindings(report: KbHealthReport): { rule: string; severity: 'error' | 'warning'; findings: KbFinding[] }[] {
  const groups = new Map<string, { rule: string; severity: 'error' | 'warning'; findings: KbFinding[] }>();
  const add = (f: KbFinding, severity: 'error' | 'warning') => {
    const key = `${severity}:${f.rule}`;
    if (!groups.has(key)) groups.set(key, { rule: f.rule, severity, findings: [] });
    groups.get(key)!.findings.push(f);
  };
  report.errors.forEach((f) => add(f, 'error'));
  report.warnings.forEach((f) => add(f, 'warning'));
  return [...groups.values()].sort((a, b) =>
    a.severity === b.severity ? a.rule.localeCompare(b.rule) : a.severity === 'error' ? -1 : 1);
}

/**
 * Health of the knowledge base (SPEC-0064): the checker's statistics, its errors and warnings by
 * rule, and the index fix (preview, then apply). The checks run in the repository's okf-check CLI.
 */
export function KbHealthPanel({ onOpenDocument, onIndexesFixed }: KbHealthPanelProps) {
  const [report, setReport] = useState<KbHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<KbIndexChange[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await window.cockpit.kb.health());
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const preview = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const result = await window.cockpit.kb.fixIndexes(false);
      if (result.changes.length) setPlan(result.changes);
      else setNotice('No index changes needed.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const open = async (file: string) => {
    const opened = await onOpenDocument(file);
    if (opened === false) {
      setNotice(file.endsWith('index.md')
        ? `${file} is not a document in the explorer (yet). If it is a missing index, Fix indexes creates it.`
        : `${file} is not a document in the explorer. Re-check to reload the knowledge base.`);
    }
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.cockpit.kb.fixIndexes(true);
      const entries = result.changes.reduce((n, c) => n + c.documents.length + c.sections.length, 0);
      // The CLI plans again from disk; if files changed since the preview, say what really happened.
      const differs = JSON.stringify(result.changes) !== JSON.stringify(plan);
      setPlan(null);
      setNotice(
        `Added ${entries} ${entries === 1 ? 'entry' : 'entries'} to ${result.changes.length} index ${result.changes.length === 1 ? 'file' : 'files'}.`
          + (differs ? ' The files changed after the preview, so this differs from the planned changes.' : ''),
      );
      onIndexesFixed();
      await check();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const stats = report?.stats;
  const groups = report ? groupFindings(report) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold">Knowledge base health</h2>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void check()} disabled={loading || busy}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Re-check
          </Button>
          <Button variant="outline" size="sm" onClick={() => void preview()} disabled={loading || busy}>
            <Wrench className="mr-1 h-4 w-4" />
            Fix indexes
          </Button>
        </div>
      </div>

      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Checking the knowledge base…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-destructive p-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

      {plan && (
        <section aria-label="Planned index changes" className="space-y-2 rounded-md border border-border p-3">
          <h3 className="text-sm font-semibold">These entries will be added</h3>
          {plan.map((c) => (
            <div key={c.index} className="text-xs">
              <div className="font-medium">
                <code>{c.index}</code>
                {c.created && <Badge variant="outline" className="ml-2">new file</Badge>}
              </div>
              <ul className="ml-4">
                {[...c.documents, ...c.sections].map((line) => (
                  <li key={line}>
                    <code>{line}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void apply()} disabled={busy}>
              Apply
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPlan(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      {report && stats && (
        <>
          <section aria-label="Summary" className="grid grid-cols-3 gap-3">
            {[
              ['Documents', stats.documents],
              ['Errors', report.errors.length],
              ['Warnings', report.warnings.length],
            ].map(([label, n]) => (
              <div key={label} className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-2xl font-semibold tabular-nums">{n}</div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatTable title="By type" counts={stats.byType} />
            <StatTable title="By status" counts={stats.byStatus} />
            <StatTable title="By folder" counts={stats.byFolder} />
            <StatTable title="Requirements by implementation" counts={stats.requirements.byImplementation} />
            <StatTable title="Requirements by priority" counts={stats.requirements.byPriority} />
            <StatTable
              title="Review age"
              counts={{
                [stats.reviewAge.reviewAfterDays ? `Reviewed within ${stats.reviewAge.reviewAfterDays} days` : 'Dated (no review period set)']: stats.reviewAge.current,
                [stats.reviewAge.reviewAfterDays ? `Due for review (older than ${stats.reviewAge.reviewAfterDays} days)` : 'Due for review']: stats.reviewAge.due,
                'No updated date': stats.reviewAge.unknown,
              }}
            />
          </div>
          {stats.drift === 'unavailable' && (
            <p className="text-xs text-muted-foreground">Source drift was not checked: git could not date the sources.</p>
          )}

          <section aria-label="Findings" className="space-y-3">
            {groups.length === 0 && <p className="text-sm text-muted-foreground">No errors or warnings.</p>}
            {groups.map((g) => (
              <div key={`${g.severity}:${g.rule}`}>
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant={g.severity === 'error' ? 'destructive' : 'outline'}>{g.severity}</Badge>
                  <h4 className="text-sm font-semibold">{`${g.rule} (${g.findings.length})`}</h4>
                </div>
                <ul className="space-y-0.5">
                  {g.findings.map((f, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="w-full rounded px-1 text-left text-xs hover:bg-accent"
                        onClick={() => void open(f.file)}
                      >
                        <code>{f.file}</code> <span className="text-muted-foreground">{f.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
