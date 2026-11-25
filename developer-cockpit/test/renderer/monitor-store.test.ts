// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_DATA, HISTORY_LENGTH, reducePoll, useMonitorStore, type MonitorData } from '../../src/renderer/stores/monitor';
import { projectConfigSchema } from '../../src/shared/projectConfig';
import type { MonitorConfigResult, MonitorPoll, ServiceCheck, ServiceStatus } from '../../src/shared/types/monitor';

const check = (name: string, status: ServiceStatus, at: number, extra: Partial<ServiceCheck> = {}): ServiceCheck => ({
  name,
  status,
  latencyMs: 12,
  checkedAt: at,
  target: `http://localhost/${name}`,
  ...extra,
});
const poll = (at: number, checks: ServiceCheck[], panels: MonitorPoll['panels'] = []): MonitorPoll => ({ at, checks, panels });

const monitoring = projectConfigSchema.parse({
  monitoring: {
    services: [
      { name: 'api', check: { kind: 'http', url: 'http://localhost:1/' }, metricsUrl: 'http://localhost:1/metrics' },
      { name: 'db', check: { kind: 'tcp', host: 'localhost', port: 5432 } },
    ],
    panels: [
      { title: 'Events/min', type: 'timeseries', unit: 'perMinute', source: { kind: 'scrape', service: 'api', metric: 'events_total', rate: true } },
      { title: 'Queue', type: 'timeseries', source: { kind: 'scrape', service: 'api', metric: 'queue' } },
    ],
  },
}).monitoring;

const CONFIG: MonitorConfigResult = { file: '/w/cockpit.yaml', present: true, projectName: 'Acme', monitoring, errors: [], links: [] };

describe('reducePoll', () => {
  it('statusChange_addsTimelineEntryWithTime', () => {
    let d: MonitorData = reducePoll(EMPTY_DATA, poll(1000, [check('api', 'UP', 1000), check('db', 'UP', 1000)]), []);
    expect(d.timeline).toEqual([]); // the first poll records no change

    d = reducePoll(d, poll(2000, [check('api', 'DOWN', 2000, { reason: 'timeout after 3000 ms' }), check('db', 'UP', 2000)]), []);
    expect(d.timeline).toEqual([{ service: 'api', from: 'UP', to: 'DOWN', at: 2000, reason: 'timeout after 3000 ms' }]);

    d = reducePoll(d, poll(3000, [check('api', 'UP', 3000), check('db', 'UNKNOWN', 3000)]), []);
    expect(d.timeline).toHaveLength(3);
    expect(d.timeline.slice(0, 2).map((e) => `${e.service}:${e.from}->${e.to}@${e.at}`).sort()).toEqual(['api:DOWN->UP@3000', 'db:UP->UNKNOWN@3000']);
    expect(d.timeline[d.timeline.length - 1]).toMatchObject({ service: 'api', to: 'DOWN', at: 2000 });
  });

  it('historyKeepsLast30Checks', () => {
    let d: MonitorData = EMPTY_DATA;
    for (let i = 1; i <= 40; i++) d = reducePoll(d, poll(i * 1000, [check('api', i % 2 ? 'UP' : 'DOWN', i * 1000, { latencyMs: i })]), []);
    expect(d.history.api).toHaveLength(HISTORY_LENGTH);
    expect(d.history.api[0]).toEqual({ status: 'UP', latencyMs: 11, at: 11_000 });
    expect(d.history.api.at(-1)).toEqual({ status: 'DOWN', latencyMs: 40, at: 40_000 });
  });

  it('derives a per-minute rate and a series from scraped values', () => {
    const p = (at: number, events: number, queue: number) =>
      poll(at, [], [
        { title: 'Events/min', type: 'timeseries', unit: 'perMinute', ok: true, value: events },
        { title: 'Queue', type: 'timeseries', unit: 'count', ok: true, value: queue },
      ]);
    let d = reducePoll(EMPTY_DATA, p(0, 100, 3), monitoring.panels);
    expect(d.panels[0].value).toBeNull(); // no baseline yet
    expect(d.panels[1].series).toEqual([{ t: 0, value: 3 }]);
    d = reducePoll(d, p(30_000, 130, 5), monitoring.panels);
    expect(d.panels[0].value).toBe(60);
    expect(d.panels[0].series).toEqual([{ t: 30_000, value: 60 }]);
    expect(d.panels[1].series).toEqual([{ t: 0, value: 3 }, { t: 30_000, value: 5 }]);
    d = reducePoll(d, p(60_000, 10, 5), monitoring.panels); // counter reset
    expect(d.panels[0].value).toBeNull();
  });
});

describe('useMonitorStore', () => {
  let api: { config: ReturnType<typeof vi.fn>; poll: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.useFakeTimers();
    api = {
      config: vi.fn(async () => CONFIG),
      poll: vi.fn(async () => poll(Date.now(), [check('api', 'UP', Date.now()), check('db', 'UP', Date.now())])),
    };
    (window as unknown as { cockpit: unknown }).cockpit = { monitor: api };
  });
  afterEach(() => {
    useMonitorStore.getState().stop();
    vi.useRealTimers();
    useMonitorStore.setState(useMonitorStore.getInitialState(), true);
  });

  it('start loads the config, polls now and then every intervalSeconds', async () => {
    await useMonitorStore.getState().start();
    expect(api.config).toHaveBeenCalledTimes(1);
    expect(api.poll).toHaveBeenCalledTimes(1);
    expect(useMonitorStore.getState().history.api).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.poll).toHaveBeenCalledTimes(2);
    expect(useMonitorStore.getState().lastUpdated).toBeGreaterThan(0);
  });

  it('overlapping polls are ignored', async () => {
    let release!: () => void;
    api.poll.mockImplementationOnce(() => new Promise((r) => (release = () => r(poll(1, [])))));
    useMonitorStore.setState({ config: CONFIG });
    const first = useMonitorStore.getState().load();
    await useMonitorStore.getState().load();
    expect(api.poll).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('a failed poll after a good one keeps the data and flags the connection', async () => {
    await useMonitorStore.getState().start();
    api.poll.mockRejectedValueOnce(new Error('IPC gone'));
    await useMonitorStore.getState().load();
    const s = useMonitorStore.getState();
    expect(s.connectionLost).toBe(true);
    expect(s.history.api).toHaveLength(1);
    expect(s.error).toBe('IPC gone');
  });

  it('a changed configuration resets the history', async () => {
    await useMonitorStore.getState().start();
    api.config.mockResolvedValueOnce({ ...CONFIG, monitoring: { ...CONFIG.monitoring, intervalSeconds: 30 } });
    await useMonitorStore.getState().refresh();
    expect(useMonitorStore.getState().history.api).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.poll).toHaveBeenCalledTimes(2); // not yet: the interval is now 30 s
    await vi.advanceTimersByTimeAsync(20_000);
    expect(api.poll).toHaveBeenCalledTimes(3);
  });
});

describe('a changed cockpit.yaml (SPEC-0076 review)', () => {
  afterEach(() => {
    useMonitorStore.getState().stop();
    useMonitorStore.setState(useMonitorStore.getInitialState(), true);
  });

  it('a poll that no longer matches the config on screen re-reads the config first', async () => {
    const edited: MonitorConfigResult = { ...CONFIG, monitoring: { ...CONFIG.monitoring, services: [...CONFIG.monitoring.services, { ...CONFIG.monitoring.services[1], name: 'cache' }] } };
    const api = {
      config: vi.fn(async () => CONFIG),
      poll: vi.fn(async () => poll(1, [check('api', 'UP', 1), check('db', 'UP', 1)])),
    };
    (window as unknown as { cockpit: unknown }).cockpit = { monitor: api };
    await useMonitorStore.getState().loadConfig();
    await useMonitorStore.getState().load();
    expect(api.config).toHaveBeenCalledTimes(1);

    api.config.mockResolvedValue(edited);
    api.poll.mockResolvedValue(poll(2, [check('api', 'UP', 2), check('db', 'UP', 2), check('cache', 'DOWN', 2)]));
    await useMonitorStore.getState().load();
    expect(api.config).toHaveBeenCalledTimes(2);
    expect(useMonitorStore.getState().config?.monitoring.services.map((s) => s.name)).toEqual(['api', 'db', 'cache']);
    expect(useMonitorStore.getState().history.cache).toHaveLength(1);
  });
});
