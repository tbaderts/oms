import { useEffect } from 'react'
import { useInvestigationStore } from '../stores/investigation.js'
import { SymptomInput } from '../components/investigation/symptom-input.js'
import { InvestigationTimeline } from '../components/investigation/investigation-timeline.js'
import { ReportView } from '../components/investigation/report-view.js'

export function Investigations() {
  const { investigations, activeInvestigation, loading, fetchInvestigations, startInvestigation, selectInvestigation, pollActive } = useInvestigationStore()

  useEffect(() => {
    fetchInvestigations()
  }, [fetchInvestigations])

  useEffect(() => {
    if (activeInvestigation?.status !== 'running') return
    const interval = setInterval(pollActive, 3000)
    return () => clearInterval(interval)
  }, [activeInvestigation?.status, pollActive])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Investigations</h1>

      <SymptomInput onSubmit={startInvestigation} loading={loading} />

      {activeInvestigation && (
        <div className="space-y-4">
          <InvestigationTimeline investigation={activeInvestigation} />
          {activeInvestigation.status === 'completed' && <ReportView investigation={activeInvestigation} />}
        </div>
      )}

      <div>
        <h2 className="text-lg font-medium mb-3">History</h2>
        <div className="space-y-2">
          {investigations.map((inv) => (
            <button
              key={inv.id}
              onClick={() => selectInvestigation(inv.id)}
              className={`w-full text-left p-3 rounded-lg border text-sm ${
                activeInvestigation?.id === inv.id
                  ? 'bg-zinc-800 border-blue-600'
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{inv.symptom}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  inv.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  inv.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-zinc-500/20 text-zinc-400'
                }`}>{inv.status}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">{new Date(inv.startedAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
