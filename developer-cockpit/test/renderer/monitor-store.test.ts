// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonitorStore, REFRESH_INTERVAL_MS } from '../../src/renderer/stores/monitor';
import type { MonitorHealthResult, MonitorMetricsResult } from '../../src/shared/types/monitor';

const HEALTH: MonitorHealthResult = { ok: true, status: 200, body: { status: 'UP' }, url: 'http://localhost:8090' };
const METRICS: MonitorMetricsResult = {
  ok: true,
  status: 200,
  raw: 'oms-outbox-pending 4\noms-order-events-total{event="X"} 5',
  url: 'http://localhost:8090',
};
const FAILED_HEALTH: MonitorHealthResult = { ok: false, status: null, body: null, url: 'http://localhost:8090', error: 'oms-core not reachable at http://localhost:8090: timeout after 10000 ms' };
const FAILED_METRICS: MonitorMetricsResult = { ok: false, status: null, raw: null, url: 'http://localhost:8090', error: 'oms-core not reachable at http://localhost:8090: timeout after 10000 ms' };

interface MonitorApi {
  health: ReturnType<typeof vi.fn>;
  metrics: ReturnType<typeof vi.fn>;
}

function setMonitorApi(overrides: Partial<Pick<MonitorApi, 'health' | 'metrics'>> = {}): MonitorApi {
  const api: MonitorApi = {
    health: (overrides.health as MonitorApi['health']) ?? vi.fn(async () => HEALTH),
    metrics: (overrides.metrics as MonitorApi['metrics']) ?? vi.fn(async () => METRICS),
  };
  (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { monitor: api };
  return api;
}

describe('useMonitorStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    useMonitorStore.setState(useMonitorStore.getInitialState(), true);
  });

  it('AC-1: load() sets sample + lastUpdated from a successful health+metrics result', async () => {
    setMonitorApi();
    await useMonitorStore.getState().load();
    const s = useMonitorStore.getState();
    expect(s.sample).not.toBeNull();
    expect(s.sample!.health?.body?.status).toBe('UP');
    expect(s.sample!.parsed).not.toBeNull();
    expect(s.lastUpdated).toBeGreaterThan(0);
    expect(s.error).toBeNull();
    expect(s.connectionLost).toBe(false);
  });

  it('AC-6: a failed poll with a previous sample keeps the sample and flags connectionLost', async () => {
    const api = setMonitorApi();
    // First successful load.
    await useMonitorStore.getState().load();
    expect(useMonitorStore.getState().sample).not.toBeNull();
    // Now make the next poll fail.
    api.health = vi.fn(async () => FAILED_HEALTH);
    api.metrics = vi.fn(async () => FAILED_METRICS);
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { monitor: api };
    await useMonitorStore.getState().load();
    const s = useMonitorStore.getState();
    expect(s.connectionLost).toBe(true);
    expect(s.sample).not.toBeNull(); // last good sample kept
    expect(s.sample!.health?.body?.status).toBe('UP');
  });

  it('AC-6: a failed poll with no previous sample sets error and no connectionLost', async () => {
    const api = setMonitorApi({
      health: vi.fn(async () => FAILED_HEALTH),
      metrics: vi.fn(async () => FAILED_METRICS),
    });
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { monitor: api };
    await useMonitorStore.getState().load();
    const s = useMonitorStore.getState();
    expect(s.error).toContain('not reachable');
    expect(s.connectionLost).toBe(false);
    expect(s.sample).toBeNull();
  });

  it('a partial failure (health ok, metrics failed) is treated as a success that keeps the health tile', async () => {
    // Exercises the `health.ok || metrics.ok` partial-success path in load(): the sample is stored
    // with the health tile present and the metrics/parsed part null, without an error banner.
    const api = setMonitorApi({
      health: vi.fn(async () => HEALTH),
      metrics: vi.fn(async () => FAILED_METRICS),
    });
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { monitor: api };
    await useMonitorStore.getState().load();
    const s = useMonitorStore.getState();
    expect(s.sample).not.toBeNull();
    expect(s.sample!.health?.body?.status).toBe('UP');
    expect(s.sample!.metrics).toBeNull();
    expect(s.sample!.parsed).toBeNull();
    expect(s.error).toBeNull();
    expect(s.connectionLost).toBe(false);
  });

  it('AC-7: auto refresh fires a new load every REFRESH_INTERVAL_MS and refreshes lastUpdated on success', async () => {
    const api = setMonitorApi();
    useMonitorStore.getState().startAutoRefresh();
    // The first load happens on start.
    await vi.advanceTimersByTimeAsync(0);
    const firstCalls = (api.health as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(firstCalls).toBe(1);
    const firstUpdated = useMonitorStore.getState().lastUpdated;
    expect(firstUpdated).not.toBeNull();
    // Advance one full interval (the fake clock moves, so Date.now() changes) → a second load.
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect((api.health as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    // The "Last updated" timestamp is refreshed on the successful poll (AC-7's second clause).
    const secondUpdated = useMonitorStore.getState().lastUpdated;
    expect(secondUpdated).not.toBeNull();
    expect(secondUpdated!).toBeGreaterThan(firstUpdated!);
    // And a third.
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect((api.health as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
    expect(useMonitorStore.getState().lastUpdated!).toBeGreaterThan(secondUpdated!);
  });

  it('AC-8: manualRefresh() fires a load immediately and restarts the interval after the response', async () => {
    const api = setMonitorApi();
    useMonitorStore.getState().startAutoRefresh();
    await vi.advanceTimersByTimeAsync(0); // initial load
    // Trigger a manual refresh at t=0 (right after the initial load).
    await useMonitorStore.getState().manualRefresh();
    expect((api.health as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2); // immediate
    // The interval restarts after the response; advancing a full interval yields the next tick.
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect((api.health as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });

  it('a refreshing guard prevents overlapping loads', async () => {
    let release: (() => void) | null = null;
    const slow = new Promise<MonitorHealthResult>((res) => {
      release = () => res(HEALTH);
    });
    const api = setMonitorApi({
      health: vi.fn(async () => (slow as Promise<MonitorHealthResult>)),
      metrics: vi.fn(async () => METRICS),
    });
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { monitor: api };
    const s = useMonitorStore.getState();
    const first = s.load();
    // A second load while the first is in flight should be a no-op.
    const second = s.load();
    release!();
    await first;
    await second;
    expect((api.health as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
