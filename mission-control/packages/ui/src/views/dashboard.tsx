import { useEffect } from 'react'
import { useAppStore } from '../stores/app.js'
import { Activity, AlertTriangle, CheckCircle, Wifi } from 'lucide-react'

export function Dashboard() {
  const { adapters, investigations, fetchAdapters, fetchInvestigations } = useAppStore()

  useEffect(() => {
    fetchAdapters()
    fetchInvestigations()
  }, [fetchAdapters, fetchInvestigations])

  const activeInvestigations = investigations.filter((i) => i.status === 'running')
  const completedToday = investigations.filter(
    (i) => i.status === 'completed' && i.startedAt.startsWith(new Date().toISOString().slice(0, 10))
  )
  const connectedAdapters = adapters.filter((a) => a.connected)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard icon={Activity} label="Active Investigations" value={activeInvestigations.length} color="text-blue-400" />
        <SummaryCard icon={AlertTriangle} label="Pending Approvals" value={0} color="text-amber-400" />
        <SummaryCard icon={CheckCircle} label="Completed Today" value={completedToday.length} color="text-green-400" />
        <SummaryCard icon={Wifi} label="Adapters Online" value={`${connectedAdapters.length}/${adapters.length}`} color="text-cyan-400" />
      </div>

      {/* Recent investigations */}
      <div>
        <h2 className="text-lg font-medium mb-3">Recent Investigations</h2>
        {investigations.length === 0 ? (
          <p className="text-zinc-500">No investigations yet. Start one from the Investigations view.</p>
        ) : (
          <div className="space-y-2">
            {investigations.slice(0, 10).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                <div>
                  <span className="text-sm font-medium">{inv.symptom}</span>
                  <span className="ml-3 text-xs text-zinc-500">{inv.id}</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={inv.status} />
                  <span className="text-xs text-zinc-500">
                    {new Date(inv.startedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Adapter status */}
      <div>
        <h2 className="text-lg font-medium mb-3">Adapter Status</h2>
        <div className="grid grid-cols-4 gap-3">
          {adapters.map((a) => (
            <div key={a.id} className={`p-3 rounded-lg border ${a.connected ? 'border-green-800 bg-green-950/30' : a.enabled ? 'border-red-800 bg-red-950/30' : 'border-zinc-800 bg-zinc-900'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{a.name}</span>
                <span className={`text-xs ${a.connected ? 'text-green-400' : a.enabled ? 'text-red-400' : 'text-zinc-500'}`}>
                  {a.connected ? 'Connected' : a.enabled ? 'Disconnected' : 'Disabled'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
      <div className="flex items-center gap-3">
        <Icon size={20} className={color} />
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    cancelled: 'bg-zinc-500/20 text-zinc-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${colors[status] ?? colors.cancelled}`}>
      {status}
    </span>
  )
}
