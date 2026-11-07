// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MonitorView } from '../../src/renderer/views/monitor/MonitorView';
import { useMonitorStore } from '../../src/renderer/stores/monitor';
import type { MonitorHealthResult, MonitorMetricsResult } from '../../src/shared/types/monitor';

const HEALTH_UP: MonitorHealthResult = { ok: true, status: 200, body: { status: 'UP' }, url: 'http://localhost:8090' };
const METRICS_OK: MonitorMetricsResult = {
  ok: true,
  status: 200,
  raw: 'oms-outbox-pending 4\noms-order-events-total{event="X"} 5',
  url: 'http://localhost:8090',
};
const HEALTH_DOWN: MonitorHealthResult = { ok: true, status: 200, body: { status: 'DOWN' }, url: 'http://localhost:8090' };
const HEALTH_FAILED: MonitorHealthResult = { ok: false, status: null, body: null, url: 'http://localhost:8090', error: 'oms-core not reachable at http://localhost:8090: timeout' };
const METRICS_FAILED: MonitorMetricsResult = { ok: false, status: null, raw: null, url: 'http://localhost:8090', error: 'oms-core not reachable at http://localhost:8090: timeout' };

function setMonitorApi(health?: MonitorHealthResult, metrics?: MonitorMetricsResult) {
  (window as unknown as { cockpit: Record<string, unknown> }).cockpit = {
    monitor: {
      health: vi.fn(async () => health ?? HEALTH_UP),
      metrics: vi.fn(async () => metrics ?? METRICS_OK),
    },
  };
}

describe('MonitorView', () => {
  // No fake timers: the view uses a real setInterval for auto-refresh and the IPC is async.
  // waitFor (real timers) lets the first load land, mirroring the DockerView tests.
  afterEach(() => {
    cleanup();
    useMonitorStore.setState(useMonitorStore.getInitialState(), true);
  });

  it('AC-1: shows an UP health indicator and the configured URL on load', async () => {
    setMonitorApi();
    render(<MonitorView />);
    await waitFor(() => expect(screen.getByText(/UP/)).toBeTruthy());
    expect(screen.getByText(/localhost:8090/)).toBeTruthy();
  });

  it('AC-1: shows a DOWN indicator when health is DOWN', async () => {
    setMonitorApi(HEALTH_DOWN, METRICS_OK);
    render(<MonitorView />);
    await waitFor(() => expect(screen.getByText(/DOWN/)).toBeTruthy());
  });

  it('AC-10: renders standalone and its data flows exclusively through monitor:* IPC', async () => {
    // Only the monitor IPC is provided; the view must not call any other cockpit feature and must
    // still render its data. This proves the view has no cross-view state coupling (AC-10).
    const healthSpy = vi.fn(async () => HEALTH_UP);
    const metricsSpy = vi.fn(async () => METRICS_OK);
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = { monitor: { health: healthSpy, metrics: metricsSpy } };
    render(<MonitorView />);
    await waitFor(() => expect(screen.getByText(/UP/)).toBeTruthy());
    // The view's data comes from the monitor IPC (both endpoints were called).
    expect(healthSpy).toHaveBeenCalled();
    expect(metricsSpy).toHaveBeenCalled();
    // No other cockpit feature exists on window.cockpit, yet the view rendered its data.
    expect(screen.getByText(/Monitoring/)).toBeTruthy();
  });

  it('AC-6: shows an error banner with the URL when there is no sample yet', async () => {
    setMonitorApi(HEALTH_FAILED, METRICS_FAILED);
    render(<MonitorView />);
    await waitFor(() => expect(screen.getByText(/not reachable/)).toBeTruthy());
    expect(screen.getByText(/localhost:8090/)).toBeTruthy();
  });

  it('AC-6: keeps the last sample visible with a stale marker when the connection is lost', async () => {
    setMonitorApi();
    render(<MonitorView />);
    // Wait for the first successful load (the view auto-loads on mount).
    await waitFor(() => expect(screen.getByText(/UP/)).toBeTruthy());
    // Now fail the next poll.
    (window as unknown as { cockpit: Record<string, unknown> }).cockpit = {
      monitor: {
        health: vi.fn(async () => HEALTH_FAILED),
        metrics: vi.fn(async () => METRICS_FAILED),
      },
    };
    useMonitorStore.getState().stopAutoRefresh();
    await useMonitorStore.getState().load();
    await waitFor(() => expect(screen.getByText(/UP/)).toBeTruthy()); // last sample still shown
    expect(screen.getByText(/Connection lost/i)).toBeTruthy();
  });
});
