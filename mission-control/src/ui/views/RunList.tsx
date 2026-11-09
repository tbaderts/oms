import { fmtMs, type RunListItem } from '../api';

/** Past runs, newest first; an unreadable run is listed with the reason (AC-7). */
export function RunList({ runs, onOpen }: { runs: RunListItem[]; onOpen: (runId: string) => void }) {
  if (runs.length === 0) return <p className="text-sm text-slate-400">No runs yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate-400">
        <tr>
          <th className="py-1">Run</th>
          <th>Status</th>
          <th>Rate</th>
          <th>Sent</th>
          <th>Filled p99</th>
          <th>Issues</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) =>
          r.readable ? (
            <tr key={r.runId} className="cursor-pointer border-t border-slate-800 hover:bg-slate-900" onClick={() => onOpen(r.runId)}>
              <td className="py-1 font-mono text-xs">
                {r.runId} {r.summary.label && <span className="font-sans text-slate-400">— {r.summary.label}</span>}
              </td>
              <td>{r.summary.status}</td>
              <td>
                {r.summary.achievedRate ?? '–'} / {r.summary.targetRate}
                {r.summary.generatorLimited && <span className="ml-1 text-amber-400">⚠</span>}
              </td>
              <td>{r.summary.sent}</td>
              <td>{fmtMs(r.summary.figures.toFilled.p99)}</td>
              <td>
                {r.summary.createErrors.length + r.summary.rejected.length + r.summary.incomplete.length || '–'}
              </td>
            </tr>
          ) : (
            <tr key={r.runId} className="border-t border-slate-800 text-slate-500">
              <td className="py-1 font-mono text-xs">{r.runId}</td>
              <td colSpan={5}>unreadable: {r.reason}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}
