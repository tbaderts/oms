import { create } from 'zustand';
import type { PanelConfig } from '@shared/projectConfig';
import type { MonitorConfigResult, MonitorPoll, PanelPoint, PanelResult, ServiceStatus } from '@shared/types/monitor';

/** Checks kept per service for the sparkline and the history strip. */
export const HISTORY_LENGTH = 30;
/** Status changes kept in the timeline. */
export const TIMELINE_LENGTH = 50;
/** Points kept per scrape timeseries panel. */
export const SERIES_LENGTH = 30;

export interface HistoryEntry {
  status: ServiceStatus;
  latencyMs: number | null;
  at: number;
}

export interface TimelineEntry {
  service: string;
  from: ServiceStatus;
  to: ServiceStatus;
  at: number;
  reason?: string;
}

/** What the view shows for one panel: the latest result, with values derived across polls. */
export interface PanelView extends PanelResult {
  /** For a scrape `rate` panel: the previous raw counter value and its time. */
  previous?: { value: number; at: number };
}

/** The part of the state a poll changes; `reducePoll` computes it, so it is testable without timers. */
export interface MonitorData {
  poll: MonitorPoll | null;
  history: Record<string, HistoryEntry[]>;
  timeline: TimelineEntry[];
  panels: PanelView[];
}

export const EMPTY_DATA: MonitorData = { poll: null, history: {}, timeline: [], panels: [] };

const push = <T>(list: T[] | undefined, item: T, max: number): T[] => [...(list ?? []), item].slice(-max);

/**
 * Folds one poll into the data: appends each check to its service's history, records status
 * changes (none on a service's first check), and derives scrape rates and scrape timeseries from
 * successive values.
 */
export function reducePoll(prev: MonitorData, poll: MonitorPoll, panelConfigs: PanelConfig[]): MonitorData {
  const history: Record<string, HistoryEntry[]> = {};
  const changes: TimelineEntry[] = [];
  for (const c of poll.checks) {
    const before = prev.history[c.name];
    const last = before?.[before.length - 1];
    if (last && last.status !== c.status) {
      changes.push({ service: c.name, from: last.status, to: c.status, at: c.checkedAt, ...(c.reason ? { reason: c.reason } : {}) });
    }
    history[c.name] = push(before, { status: c.status, latencyMs: c.latencyMs, at: c.checkedAt }, HISTORY_LENGTH);
  }

  const panels = poll.panels.map((result, i): PanelView => {
    const cfg = panelConfigs[i];
    const old = prev.panels[i];
    const scrape = cfg?.source.kind === 'scrape' ? cfg.source : null;
    if (!scrape || !result.ok) return result;

    let value = result.value ?? null;
    let previous: PanelView['previous'];
    if (scrape.rate) {
      // A counter: the per-minute increase since the previous poll; a reset (decrease) restarts it.
      const raw = result.value;
      if (typeof raw === 'number') {
        previous = { value: raw, at: poll.at };
        const p = old?.previous;
        value = p && raw >= p.value && poll.at > p.at ? ((raw - p.value) / (poll.at - p.at)) * 60_000 : null;
      } else {
        value = null;
      }
    }
    if (cfg.type === 'timeseries') {
      const series: PanelPoint[] = value === null ? (old?.series ?? []) : push(old?.series, { t: poll.at, value }, SERIES_LENGTH);
      return { ...result, value, series, ...(previous ? { previous } : {}) };
    }
    return { ...result, value, ...(previous ? { previous } : {}) };
  });

  return {
    poll,
    history,
    timeline: [...changes.reverse(), ...prev.timeline].slice(0, TIMELINE_LENGTH),
    panels,
  };
}

/**
 * Whether a poll was made from `config`: the same services, and the same panels in the same order
 * when the poll carries panels (a poll always returns every configured panel).
 */
export function matchesConfig(poll: MonitorPoll, config: MonitorConfigResult | null): boolean {
  if (!config) return false;
  const m = config.monitoring;
  const services = poll.checks.length === m.services.length && poll.checks.every((c, i) => c.name === m.services[i].name);
  const panels = poll.panels.length === 0 || (poll.panels.length === m.panels.length && poll.panels.every((p, i) => p.title === m.panels[i].title));
  return services && panels;
}

interface MonitorState extends MonitorData {
  config: MonitorConfigResult | null;
  /** Shown when the configuration or the first poll could not be loaded. */
  error: string | null;
  /** A later poll failed; the last data stays on screen, marked stale. */
  connectionLost: boolean;
  refreshing: boolean;
  lastUpdated: number | null;

  /** Reads the configuration; a changed configuration resets the collected history. */
  loadConfig: () => Promise<void>;
  /** One poll; overlapping calls are ignored. */
  load: () => Promise<void>;
  /** Loads the configuration, polls now and then every `intervalSeconds`. */
  start: () => Promise<void>;
  stop: () => void;
  /** Re-reads the configuration and polls now, restarting the timer. */
  refresh: () => Promise<void>;
}

let timer: ReturnType<typeof setInterval> | null = null;
let timerMs = 0;

const configKey = (c: MonitorConfigResult | null) => (c ? JSON.stringify([c.file, c.monitoring]) : '');

export const useMonitorStore = create<MonitorState>((set, get) => {
  const schedule = () => {
    const seconds = get().config?.monitoring.intervalSeconds ?? 10;
    const ms = seconds * 1000;
    if (timer && timerMs === ms) return;
    if (timer) clearInterval(timer);
    timerMs = ms;
    timer = setInterval(() => void get().load(), ms);
  };

  return {
    ...EMPTY_DATA,
    config: null,
    error: null,
    connectionLost: false,
    refreshing: false,
    lastUpdated: null,

    loadConfig: async () => {
      const api = window.cockpit?.monitor;
      if (!api) {
        set({ error: 'The Monitoring feature is not available in this build.' });
        return;
      }
      try {
        const config = await api.config();
        if (configKey(config) !== configKey(get().config)) set({ ...EMPTY_DATA, config, lastUpdated: null, connectionLost: false });
        else set({ config });
        set({ error: null });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Cannot read the monitoring configuration.' });
      }
    },

    load: async () => {
      if (get().refreshing) return;
      const api = window.cockpit?.monitor;
      if (!api) return;
      set({ refreshing: true });
      try {
        const poll = await api.poll();
        // The main process polls the current cockpit.yaml; when that no longer matches the config
        // on screen (the file was edited), re-read it first so tiles and panels line up again.
        if (!matchesConfig(poll, get().config)) await get().loadConfig();
        const data = reducePoll(get(), poll, get().config?.monitoring.panels ?? []);
        set({ ...data, refreshing: false, connectionLost: false, error: null, lastUpdated: poll.at });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'The poll failed.';
        if (get().poll) set({ refreshing: false, connectionLost: true, error: message });
        else set({ refreshing: false, error: message });
      }
    },

    start: async () => {
      await get().loadConfig();
      await get().load();
      schedule();
    },

    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
      timerMs = 0;
    },

    refresh: async () => {
      get().stop();
      await get().loadConfig();
      await get().load();
      schedule();
    },
  };
});
