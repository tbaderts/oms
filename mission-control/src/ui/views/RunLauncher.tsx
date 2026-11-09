import { useState } from 'react';
import { MAX_DURATION_SEC, MAX_RATE, type RunConfigInput } from '../../shared/types';
import { ApiError } from '../api';

interface Form {
  omsBaseUrl: string;
  rate: number;
  durationSec: number;
  label: string;
  symbol: string;
  side: 'BUY' | 'SELL' | 'SELL_SHORT';
  ordType: 'MARKET' | 'LIMIT';
  orderQty: number;
  price: string;
  timeInForce: string;
  completionTimeoutSec: number;
}

const INITIAL: Form = {
  omsBaseUrl: 'http://localhost:8090',
  rate: 20,
  durationSec: 60,
  label: '',
  symbol: 'AAPL',
  side: 'BUY',
  ordType: 'MARKET',
  orderQty: 100,
  price: '',
  timeInForce: 'DAY',
  completionTimeoutSec: 30,
};

export function toRunConfig(f: Form): RunConfigInput {
  return {
    omsBaseUrl: f.omsBaseUrl,
    rate: Number(f.rate),
    durationSec: Number(f.durationSec),
    completionTimeoutSec: Number(f.completionTimeoutSec),
    label: f.label || undefined,
    template: {
      symbol: f.symbol,
      side: f.side,
      ordType: f.ordType,
      orderQty: Number(f.orderQty),
      price: f.ordType === 'LIMIT' && f.price ? Number(f.price) : undefined,
      timeInForce: f.timeInForce,
    },
  };
}

/** Configure and start a run. A preflight refusal shows the failed check (AC-6). */
export function RunLauncher({ onStart }: { onStart: (config: RunConfigInput) => Promise<void> }) {
  const [f, setF] = useState<Form>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value as Form[K] });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onStart(toRunConfig(f));
    } catch (err) {
      const p = err instanceof ApiError ? err.problem : null;
      setError(p ? `${p.title}${p.check ? ` [${p.check}]` : ''}${p.detail ? `: ${p.detail}` : ''}` : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm';
  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">
        oms-core URL
        <input className={field} value={f.omsBaseUrl} onChange={set('omsBaseUrl')} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Label
        <input className={field} value={f.label} onChange={set('label')} placeholder="optional" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Rate (orders/s, ≤ {MAX_RATE})
        <input className={field} type="number" min={1} max={MAX_RATE} step="any" value={f.rate} onChange={set('rate')} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Duration (s, ≤ {MAX_DURATION_SEC})
        <input className={field} type="number" min={1} max={MAX_DURATION_SEC} value={f.durationSec} onChange={set('durationSec')} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Completion timeout (s)
        <input className={field} type="number" min={1} max={600} value={f.completionTimeoutSec} onChange={set('completionTimeoutSec')} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Symbol
        <input className={field} value={f.symbol} onChange={set('symbol')} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Side
        <select className={field} value={f.side} onChange={set('side')}>
          <option>BUY</option>
          <option>SELL</option>
          <option>SELL_SHORT</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Order type
        <select className={field} value={f.ordType} onChange={set('ordType')}>
          <option>MARKET</option>
          <option>LIMIT</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Quantity
        <input className={field} type="number" min={1} value={f.orderQty} onChange={set('orderQty')} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Limit price
        <input className={field} type="number" step="any" value={f.price} onChange={set('price')} disabled={f.ordType !== 'LIMIT'} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Time in force
        <input className={field} value={f.timeInForce} onChange={set('timeInForce')} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <button type="submit" disabled={busy} className="rounded bg-emerald-700 px-4 py-1.5 text-sm hover:bg-emerald-600 disabled:opacity-40">
          {busy ? 'Checking…' : 'Start run'}
        </button>
        <span className="text-xs text-slate-400">{Math.round(Number(f.rate) * Number(f.durationSec))} orders</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-300 sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}
