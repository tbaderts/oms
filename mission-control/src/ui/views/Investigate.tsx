import { useRef, useState } from 'react';
import type { AiEvent, AiStatus } from '../../shared/types';
import type { Investigate as InvestigateFn } from '../api';

interface ToolEntry {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
}

const SUGGESTIONS = [
  'Where does the time to filled go? Compare the OMS checkpoint deltas with the market round trip.',
  'Look at the slowest orders and their event history. What do they have in common?',
  'Was the outbox backed up during the run? Check oms_outbox_pending and the oms-core logs.',
];

/** Ask the agent about a run; tool calls and the streamed answer appear as they happen (AC-8). */
export function Investigate({ runId, status, investigate, onStop }: { runId: string; status: AiStatus | null; investigate: InvestigateFn; onStop?: (invId: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const invId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const available = status?.available === true;

  const onEvent = (e: AiEvent) => {
    switch (e.type) {
      case 'ai:message':
        setAnswer((a) => a + e.text);
        break;
      case 'ai:tool-call':
        setTools((t) => [...t, { id: e.toolCallId, name: e.name, input: e.input }]);
        break;
      case 'ai:tool-result':
        setTools((t) => t.map((x) => (x.id === e.toolCallId ? { ...x, output: e.output } : x)));
        break;
      case 'ai:error':
        setError(e.message);
        break;
      case 'ai:done':
        if (e.aborted) setNote('Stopped.');
        else if (e.incomplete) setNote('Stopped at the step limit; ask a narrower question or continue.');
        break;
    }
  };

  const ask = async () => {
    setAnswer('');
    setTools([]);
    setError(null);
    setNote(null);
    setBusy(true);
    abort.current = new AbortController();
    try {
      await investigate(runId, prompt, (id) => (invId.current = id), onEvent, abort.current.signal);
    } catch (e) {
      if (!abort.current.signal.aborted) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
      <h3 className="text-sm font-medium">Investigate with AI {status?.model && <span className="text-slate-500">({status.provider} · {status.model})</span>}</h3>
      {!available && <p className="text-sm text-amber-300">{status?.reason ?? 'AI provider status unknown.'}</p>}
      <textarea
        className="h-24 w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm"
        placeholder="Ask about this run…"
        value={prompt}
        disabled={!available || busy}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded bg-sky-700 px-3 py-1 text-sm hover:bg-sky-600 disabled:opacity-40"
          disabled={!available || busy || !prompt.trim()}
          onClick={ask}
        >
          Ask
        </button>
        {busy && (
          <button
            className="rounded bg-slate-700 px-3 py-1 text-sm"
            onClick={() => {
              if (invId.current) onStop?.(invId.current);
              abort.current?.abort();
            }}
          >
            Stop
          </button>
        )}
        {available &&
          !busy &&
          SUGGESTIONS.map((s) => (
            <button key={s} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" onClick={() => setPrompt(s)}>
              {s.split('?')[0]}?
            </button>
          ))}
      </div>
      {tools.length > 0 && (
        <ol className="space-y-1 text-xs">
          {tools.map((t) => (
            <li key={t.id} data-testid={`tool-${t.id}`} className="rounded bg-slate-950 p-2 font-mono">
              <div className="text-sky-300">
                {t.name}({JSON.stringify(t.input)})
              </div>
              {t.output !== undefined ? <div className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-slate-400">{t.output}</div> : <div className="text-slate-500">…</div>}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      {answer && (
        <div data-testid="answer" className="whitespace-pre-wrap text-sm leading-relaxed">
          {answer}
        </div>
      )}
      {note && <p className="text-xs text-slate-400">{note}</p>}
    </section>
  );
}
