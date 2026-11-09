import { useEffect, useState } from 'react';
import type { AiEvent, AiStatus, OrderSample, RunConfig, RunConfigInput, RunSummary, SeriesPoint, Snapshot } from '../shared/types';

export interface Problem {
  title: string;
  status: number;
  detail?: string;
  check?: string;
}

export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ? `${problem.title}: ${problem.detail}` : problem.title);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(body ?? { title: res.statusText, status: res.status });
  return body as T;
}

export type RunListItem = { runId: string; readable: true; summary: RunSummary } | { runId: string; readable: false; reason: string };
export interface RunDetail {
  config: RunConfig;
  summary: RunSummary;
  series: SeriesPoint[];
}

export const api = {
  startRun: (config: RunConfigInput) => call<{ runId: string }>('/mc/runs', { method: 'POST', body: JSON.stringify(config) }),
  stopRun: (runId: string) => call<{ stopping: boolean }>(`/mc/runs/${runId}/stop`, { method: 'POST' }),
  listRuns: () => call<RunListItem[]>('/mc/runs'),
  getRun: (runId: string) => call<RunDetail>(`/mc/runs/${runId}`),
  samples: (runId: string, sort?: string, limit = 20) => call<OrderSample[]>(`/mc/runs/${runId}/samples?${new URLSearchParams({ ...(sort ? { sort } : {}), limit: String(limit) })}`),
  aiStatus: () => call<AiStatus>('/mc/ai/status'),
};

/** Live snapshots of a run over SSE; `final` is set when the server sends `done`. */
export function useRunStream(runId: string | null): { snapshot: Snapshot | null; final: Snapshot | null } {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [final, setFinal] = useState<Snapshot | null>(null);
  useEffect(() => {
    setSnapshot(null);
    setFinal(null);
    if (!runId) return;
    const es = new EventSource(`/mc/runs/${runId}/stream`);
    es.addEventListener('snapshot', (e) => setSnapshot(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('done', (e) => {
      setFinal(JSON.parse((e as MessageEvent).data));
      es.close();
    });
    return () => es.close();
  }, [runId]);
  return { snapshot, final };
}

export type Investigate = (runId: string, prompt: string, onStart: (invId: string) => void, onEvent: (e: AiEvent) => void, signal?: AbortSignal) => Promise<void>;

/** POST /mc/runs/:id/investigate and parse its SSE body (EventSource cannot POST). */
export const investigate: Investigate = async (runId, prompt, onStart, onEvent, signal) => {
  const res = await fetch(`/mc/runs/${runId}/investigate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }), signal });
  if (!res.ok || !res.body) throw new ApiError(await res.json().catch(() => ({ title: res.statusText, status: res.status })));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!data) continue;
      if (event === 'start') onStart(JSON.parse(data).invId);
      else if (event === 'ai') onEvent(JSON.parse(data));
    }
  }
};

export const stopInvestigation = (invId: string) => call<{ stopping: boolean }>(`/mc/investigations/${invId}/stop`, { method: 'POST' });

export const fmtMs = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(1)} ms`);
