import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import type { MissionControlConfig } from '../types/index.js'
import { Save, RefreshCw } from 'lucide-react'

export function SettingsView() {
  const [config, setConfig] = useState<MissionControlConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api.config.get().then(setConfig)
  }, [])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    await api.config.update(config)
    setSaving(false)
    setMessage('Saved!')
    setTimeout(() => setMessage(''), 2000)
  }

  if (!config) return <div className="p-6 text-zinc-400">Loading...</div>

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <div className="flex items-center gap-2">
          {message && <span className="text-green-400 text-sm">{message}</span>}
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-50">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
        </div>
      </div>

      {/* AI Provider */}
      <Section title="AI Provider">
        <Field label="Provider" value={config.ai.provider} onChange={(v) => setConfig({ ...config, ai: { ...config.ai, provider: v } })} />
        <Field label="Model" value={config.ai.model} onChange={(v) => setConfig({ ...config, ai: { ...config.ai, model: v } })} />
        <Field label="API Key" value={config.ai.apiKey} onChange={(v) => setConfig({ ...config, ai: { ...config.ai, apiKey: v } })} type="password" />
      </Section>

      {/* Kubernetes */}
      <Section title="Kubernetes">
        <Toggle label="Enabled" checked={config.adapters.kubernetes.enabled} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, kubernetes: { ...config.adapters.kubernetes, enabled: v } } })} />
        <Field label="Kubeconfig" value={config.adapters.kubernetes.kubeconfig} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, kubernetes: { ...config.adapters.kubernetes, kubeconfig: v } } })} />
        <Field label="Default Namespace" value={config.adapters.kubernetes.defaultNamespace} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, kubernetes: { ...config.adapters.kubernetes, defaultNamespace: v } } })} />
      </Section>

      {/* Docker */}
      <Section title="Docker">
        <Toggle label="Enabled" checked={config.adapters.docker.enabled} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, docker: { ...config.adapters.docker, enabled: v } } })} />
        <Field label="Socket Path" value={config.adapters.docker.socketPath} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, docker: { ...config.adapters.docker, socketPath: v } } })} />
      </Section>

      {/* PostgreSQL */}
      <Section title="PostgreSQL">
        <Toggle label="Enabled" checked={config.adapters.postgresql.enabled} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, postgresql: { ...config.adapters.postgresql, enabled: v } } })} />
        <Field label="Connection String" value={config.adapters.postgresql.connectionString} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, postgresql: { ...config.adapters.postgresql, connectionString: v } } })} type="password" />
      </Section>

      {/* Prometheus */}
      <Section title="Prometheus">
        <Toggle label="Enabled" checked={config.adapters.prometheus.enabled} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, prometheus: { ...config.adapters.prometheus, enabled: v } } })} />
        <Field label="URL" value={config.adapters.prometheus.url} onChange={(v) => setConfig({ ...config, adapters: { ...config.adapters, prometheus: { ...config.adapters.prometheus, url: v } } })} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium border-b border-zinc-800 pb-2">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-zinc-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-80 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-zinc-400">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-zinc-700'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
