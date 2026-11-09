import { useCallback, useEffect, useState } from 'react';
import type { AiStatus } from '../shared/types';
import { api, investigate, stopInvestigation, useRunStream, type RunDetail, type RunListItem } from './api';
import { Investigate } from './views/Investigate';
import { LiveRun } from './views/LiveRun';
import { RunLauncher } from './views/RunLauncher';
import { RunList } from './views/RunList';
import { RunResult } from './views/RunResult';

type View = { kind: 'launch' } | { kind: 'runs' } | { kind: 'live'; runId: string } | { kind: 'result'; runId: string };

export function App() {
  const [view, setView] = useState<View>({ kind: 'launch' });
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const liveId = view.kind === 'live' ? view.runId : null;
  const { snapshot, final } = useRunStream(liveId);

  const refreshRuns = useCallback(() => api.listRuns().then(setRuns).catch(() => setRuns([])), []);
  useEffect(() => {
    refreshRuns();
    api.aiStatus().then(setAiStatus).catch(() => setAiStatus(null));
  }, [refreshRuns]);

  // A run that ends while it is shown switches to its result.
  useEffect(() => {
    if (liveId && final) {
      refreshRuns();
      setView({ kind: 'result', runId: liveId });
    }
  }, [final, liveId, refreshRuns]);

  useEffect(() => {
    setDetail(null);
    if (view.kind === 'result') api.getRun(view.runId).then(setDetail).catch(() => setDetail(null));
  }, [view]);

  const open = (runId: string) => {
    const active = runs.find((r) => r.runId === runId && r.readable && ['RUNNING', 'DRAINING', 'PREFLIGHT'].includes(r.summary.status));
    setView(active ? { kind: 'live', runId } : { kind: 'result', runId });
  };

  const tab = (kind: View['kind'], label: string, onClick: () => void) => (
    <button onClick={onClick} className={`rounded px-3 py-1 text-sm ${view.kind === kind ? 'bg-slate-700' : 'hover:bg-slate-800'}`}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center gap-4 border-b border-slate-800 px-4 py-2">
        <h1 className="font-semibold">Mission Control</h1>
        <nav className="flex gap-1">
          {tab('launch', 'New run', () => setView({ kind: 'launch' }))}
          {tab('runs', 'Runs', () => {
            refreshRuns();
            setView({ kind: 'runs' });
          })}
          {liveId && tab('live', 'Live', () => undefined)}
        </nav>
      </header>
      <main className="space-y-4 p-4">
        {view.kind === 'launch' && (
          <RunLauncher
            onStart={async (config) => {
              const { runId } = await api.startRun(config);
              setView({ kind: 'live', runId });
            }}
          />
        )}
        {view.kind === 'runs' && <RunList runs={runs} onOpen={open} />}
        {view.kind === 'live' &&
          (snapshot ? (
            <>
              <LiveRun snapshot={snapshot} onStop={() => api.stopRun(view.runId).catch(() => undefined)} />
              <Investigate runId={view.runId} status={aiStatus} investigate={investigate} onStop={(id) => void stopInvestigation(id).catch(() => undefined)} />
            </>
          ) : (
            <p className="text-sm text-slate-400">Waiting for the first snapshot…</p>
          ))}
        {view.kind === 'result' &&
          (detail ? (
            <>
              <RunResult run={detail} />
              <Investigate runId={view.runId} status={aiStatus} investigate={investigate} onStop={(id) => void stopInvestigation(id).catch(() => undefined)} />
            </>
          ) : (
            <p className="text-sm text-slate-400">Loading run…</p>
          ))}
      </main>
    </div>
  );
}
