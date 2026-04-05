import { useState } from 'react'
import { Search } from 'lucide-react'

export function SymptomInput({ onSubmit, loading }: { onSubmit: (symptom: string) => void; loading: boolean }) {
  const [symptom, setSymptom] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (symptom.trim() && !loading) {
      onSubmit(symptom.trim())
      setSymptom('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="flex-1 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={symptom}
          onChange={(e) => setSymptom(e.target.value)}
          placeholder="Describe the symptom, e.g. 'pods restarting in production namespace'"
          className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
          disabled={loading}
        />
      </div>
      <button
        type="submit"
        disabled={!symptom.trim() || loading}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Starting...' : 'Investigate'}
      </button>
    </form>
  )
}
