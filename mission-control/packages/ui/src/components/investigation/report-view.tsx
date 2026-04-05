import type { Investigation } from '../../types/index.js'

export function ReportView({ investigation }: { investigation: Investigation }) {
  const report = investigation.report
  if (!report) return null

  return (
    <div className="space-y-4 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
      <h3 className="text-lg font-medium">Investigation Report</h3>

      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-1">Root Cause</h4>
        <p className="text-sm">{report.rootCause}</p>
      </div>

      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-1">Evidence</h4>
        <div className="space-y-2">
          {report.evidence.map((e, i) => (
            <div key={i} className="p-2 bg-zinc-800 rounded text-sm">
              <span className="text-zinc-400">[{e.source}]</span> {e.finding}
              {e.data && <pre className="mt-1 text-xs text-zinc-500 overflow-x-auto">{e.data}</pre>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-1">Timeline</h4>
        <div className="space-y-1">
          {report.timeline.map((t, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="text-zinc-500 font-mono text-xs">{t.timestamp}</span>
              <span>{t.event}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-1">Recommendations</h4>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {report.recommendations.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
