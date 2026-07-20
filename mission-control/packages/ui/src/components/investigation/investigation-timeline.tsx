import type { Investigation } from '../../types/index.js'
import { CheckCircle, Loader2, XCircle, Clock } from 'lucide-react'

export function InvestigationTimeline({ investigation }: { investigation: Investigation }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{investigation.symptom}</h3>
          <p className="text-xs text-zinc-500">{investigation.id} -- Started {new Date(investigation.startedAt).toLocaleString()}</p>
        </div>
        <StatusIcon status={investigation.status} />
      </div>

      {investigation.playbook && (
        <div className="p-3 bg-zinc-900 rounded border border-zinc-800">
          <p className="text-xs text-zinc-400">Playbook matched: <span className="text-white">{investigation.playbook}</span></p>
        </div>
      )}

      {investigation.status === 'running' && (
        <div className="flex items-center gap-2 text-blue-400 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Investigation in progress...
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <Loader2 size={20} className="text-blue-400 animate-spin" />
    case 'completed':
      return <CheckCircle size={20} className="text-green-400" />
    case 'failed':
      return <XCircle size={20} className="text-red-400" />
    default:
      return <Clock size={20} className="text-zinc-400" />
  }
}
