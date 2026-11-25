// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MonitorView } from '../../src/renderer/views/monitor/MonitorView';
import { useMonitorStore } from '../../src/renderer/stores/monitor';
import { defaultProjectConfig, projectConfigSchema } from '../../src/shared/projectConfig';
import type { MonitorConfigResult, MonitorPoll } from '../../src/shared/types/monitor';

const monitoring = projectConfigSchema.parse({
  monitoring: {
    services: [
      { name: 'api', group: 'Application', check: { kind: 'spring-actuator', url: 'http://localhost:8000/actuator/health' } },
      { name: 'web', group: 'Application', check: { kind: 'http', url: 'http://localhost:3001/' } },
      { name: 'db', group: 'Data', check: { kind: 'tcp', host: 'localhost', port: 5432 } },
    ],
  },
}).monitoring;

const CONFIG: MonitorConfigResult = {
  file: '/work/acme/cockpit.yaml',
  present: true,
  projectName: 'Acme Shop',
  monitoring,
  errors: [],
  links: [{ label: 'Grafana', url: 'http://localhost:3000' }],
};

const POLL: MonitorPoll = {
  at: 1000,
  panels: [],
  checks: [
    { name: 'api', status: 'UP', latencyMs: 20, checkedAt: 1000, target: 'http://localhost:8000/actuator/health', components: { db: 'UP' } },
    { name: 'web', status: 'DOWN', latencyMs: 3000, checkedAt: 1000, target: 'http://localhost:3001/', reason: 'timeout after 3000 ms' },
    { name: 'db', status: 'UP', latencyMs: 2, checkedAt: 1000, target: 'localhost:5432' },
  ],
};

function setApi(config: MonitorConfigResult, poll: MonitorPoll = POLL) {
  (window as unknown as { cockpit: unknown }).cockpit = {
    monitor: { config: vi.fn(async () => config), poll: vi.fn(async () => poll) },
    shell: { openExternal: vi.fn() },
  };
}

describe('MonitorView', () => {
  afterEach(() => {
    cleanup();
    useMonitorStore.getState().stop();
    useMonitorStore.setState(useMonitorStore.getInitialState(), true);
  });

  it('showsOneTilePerServiceGroupedWithUpCount', async () => {
    setApi(CONFIG);
    render(<MonitorView />);
    await waitFor(() => expect(screen.getByTestId('monitor-summary').textContent).toBe('2 of 3 up'));

    const groups = screen.getAllByTestId('service-group');
    expect(groups.map((g) => g.getAttribute('data-group'))).toEqual(['Application', 'Data']);
    expect(within(groups[0]).getAllByTestId('service-tile').map((t) => t.getAttribute('data-service'))).toEqual(['api', 'web']);
    expect(within(groups[1]).getAllByTestId('service-tile').map((t) => t.getAttribute('data-service'))).toEqual(['db']);
    expect(within(groups[0]).getByText('1/2 up')).toBeTruthy();

    const web = screen.getAllByTestId('service-tile').find((t) => t.getAttribute('data-service') === 'web')!;
    expect(web.getAttribute('data-status')).toBe('DOWN');
    expect(within(web).getByTestId('service-reason').textContent).toBe('timeout after 3000 ms');
    expect(within(web).getByText('http://localhost:3001/')).toBeTruthy();
    expect(screen.getByText(/Acme Shop/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Grafana/ })).toBeTruthy();
  });

  it('configErrorBanner_namesFileAndPath', async () => {
    setApi({
      ...CONFIG,
      monitoring: defaultProjectConfig().monitoring,
      errors: [{ path: 'monitoring.services[0].check.url', message: 'Must be an http(s) URL' }],
    });
    render(<MonitorView />);
    const banner = await screen.findByTestId('monitor-config-errors');
    expect(banner.textContent).toContain('/work/acme/cockpit.yaml');
    expect(banner.textContent).toContain('monitoring.services[0].check.url: Must be an http(s) URL');
    expect(screen.queryByTestId('monitor-empty')).toBeNull();
  });

  it('emptyState_namesFile', async () => {
    setApi({ ...CONFIG, present: false, monitoring: defaultProjectConfig().monitoring, links: [] }, { at: 1, checks: [], panels: [] });
    render(<MonitorView />);
    const empty = await screen.findByTestId('monitor-empty');
    expect(empty.textContent).toContain('/work/acme/cockpit.yaml');
    expect(empty.textContent).toContain('does not exist yet');
    expect(screen.queryByTestId('service-group')).toBeNull();
  });

  it('the timeline lists status changes between polls', async () => {
    setApi(CONFIG);
    render(<MonitorView />);
    await screen.findByTestId('monitor-summary');
    expect(screen.getByTestId('status-timeline').textContent).toContain('No changes');

    const recovered: MonitorPoll = { ...POLL, at: 2000, checks: POLL.checks.map((c) => ({ ...c, status: 'UP' as const, reason: undefined, checkedAt: 2000 })) };
    (window as unknown as { cockpit: { monitor: { poll: ReturnType<typeof vi.fn> } } }).cockpit.monitor.poll.mockResolvedValue(recovered);
    await useMonitorStore.getState().load();
    await waitFor(() => expect(screen.getAllByTestId('timeline-entry')).toHaveLength(1));
    expect(screen.getByTestId('timeline-entry').textContent).toContain('web');
    expect(screen.getByTestId('timeline-entry').textContent).toContain('DOWN → UP');
  });
});
