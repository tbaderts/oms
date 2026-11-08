import { create } from 'zustand';
import type { MonitorSample } from '@shared/types/monitor';
import { parsePrometheus } from '@shared/prometheusParser';

/** The auto-refresh cadence while the view is open (design → Decision 4); matches the request timeout. */
export const REFRESH_INTERVAL_MS = 10_000;

interface MonitorState {
  /** The last successful combined health+metrics snapshot, or null before the first success. */
  sample: MonitorSample | null;
  /** A failure message when no sample is available yet (first-ever failure). */
  error: string | null;
  /** True when a later poll failed but a previous good sample is still on screen (kept, marked stale). */
  connectionLost: boolean;
  /** True while a load is in flight; guards against overlapping polls. */
  refreshing: boolean;
  /** Epoch ms of the last successful poll; null until then. */
  lastUpdated: number | null;
  /**
   * Order events per minute, derived from the accumulated `eventsTotal` counter across the
   * samples observed so far (AC-3). Null until two successful samples establish a baseline.
   */
  eventsPerMinute: number | null;

  /** Fires `monitor:health` + `monitor:metrics` in parallel and applies the result. */
  load: () => Promise<void>;
  /** Starts the 10 s auto-refresh (does not fire an immediate load on its own). */
  startAutoRefresh: (intervalMs?: number) => void;
  /** Stops the auto-refresh. */
  stopAutoRefresh: () => void;
  /** Fires a load immediately and restarts the auto-refresh timer after the response lands. */
  manualRefresh: () => Promise<void>;
  /** Resets the auto-refresh timer without firing an immediate load (used by manualRefresh). */
  resetAutoRefreshTimer: (intervalMs?: number) => void;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Baseline for the events-per-minute rate (AC-3). The Prometheus counter is cumulative since
 * process start, so the rate is `(latest - baseline) / elapsed minutes` across the samples we've
 * observed. Reset when the counter appears to have restarted (decreased).
 */
let eventBaseline: { count: number; at: number } | null = null;

function computeEventsPerMinute(parsedEventsTotal: number): number | null {
  const now = Date.now();
  if (eventBaseline === null || parsedEventsTotal < eventBaseline.count) {
    // First sample, or the counter restarted (oms-core restarted): reset the baseline.
    eventBaseline = { count: parsedEventsTotal, at: now };
    return null;
  }
  const elapsedMs = now - eventBaseline.at;
  if (elapsedMs <= 0) return null;
  const delta = parsedEventsTotal - eventBaseline.count;
  return Math.round(((delta / elapsedMs) * 60_000) * 10) / 10;
}

export const useMonitorStore = create<MonitorState>((set, get) => ({
  sample: null,
  error: null,
  connectionLost: false,
  refreshing: false,
  lastUpdated: null,
  eventsPerMinute: null,

  load: async () => {
    if (get().refreshing) return; // a poll is already in flight
    const api = window.cockpit?.monitor;
    if (!api) {
      set({ error: 'The Monitoring feature is not available in this build.', refreshing: false });
      return;
    }
    set({ refreshing: true });
    try {
      const [health, metrics] = await Promise.all([api.health(), api.metrics()]);
      const ok = health.ok || metrics.ok;
      const now = Date.now();
      const sample: MonitorSample = {
        health: health.ok ? health : null,
        metrics: metrics.ok ? metrics : null,
        parsed: metrics.ok && metrics.raw ? parsePrometheus(metrics.raw) : null,
        updatedAt: now,
        url: (health.url || metrics.url || '').replace(/\/+$/, ''),
      };
      if (ok) {
        set({
          sample,
          error: null,
          connectionLost: false,
          lastUpdated: now,
          eventsPerMinute: sample.parsed ? computeEventsPerMinute(sample.parsed.eventsTotal) : null,
          refreshing: false,
        });
      } else {
        // A failed poll: keep the previous sample (if any) and flag it; otherwise show the error.
        const prev = get().sample;
        const message = health.error || metrics.error || 'oms-core not reachable.';
        if (prev) {
          set({ connectionLost: true, error: message, refreshing: false });
        } else {
          set({ error: message, connectionLost: false, sample: null, refreshing: false });
        }
      }
    } catch (e) {
      const prev = get().sample;
      const message = e instanceof Error ? e.message : 'Failed to reach oms-core.';
      if (prev) set({ connectionLost: true, error: message, refreshing: false });
      else set({ error: message, connectionLost: false, sample: null, refreshing: false });
    }
  },

  startAutoRefresh: (intervalMs = REFRESH_INTERVAL_MS) => {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      void get().load();
    }, intervalMs);
    // Fire the first poll immediately so the view is populated on open.
    void get().load();
  },

  // Internal (not part of the public API contract, but exported for the view's convenience):
  // reset the timer without firing an immediate load. Used by manualRefresh so the next auto poll
  // is a full interval away from the manual one.
  resetAutoRefreshTimer: (intervalMs = REFRESH_INTERVAL_MS) => {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      void get().load();
    }, intervalMs);
  },

  stopAutoRefresh: () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },

  manualRefresh: async () => {
    // Fire immediately, then restart the timer so the next auto poll is a full interval away.
    const id = intervalId;
    const wasRunning = id !== null;
    if (id !== null) {
      clearInterval(id);
      intervalId = null;
    }
    await get().load();
    if (wasRunning) get().resetAutoRefreshTimer();
    else if (get().sample || get().error) {
      // No auto-refresh was running (e.g. called before startAutoRefresh); start one so the view
      // keeps updating.
      get().startAutoRefresh();
    }
  },
}));
