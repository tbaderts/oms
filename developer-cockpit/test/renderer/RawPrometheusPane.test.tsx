// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RawPrometheusPane } from '../../src/renderer/views/monitor/RawPrometheusPane';
import { useMonitorStore } from '../../src/renderer/stores/monitor';
import type { MonitorSample, MonitorHealthResult, MonitorMetricsResult, ParsedMetrics } from '../../src/shared/types/monitor';

const HEALTH: MonitorHealthResult = { ok: true, status: 200, body: { status: 'UP' }, url: 'http://localhost:8090' };

function seed(raw: string | null, truncated?: boolean) {
  const metrics: MonitorMetricsResult = {
    ok: raw !== null,
    status: raw !== null ? 200 : null,
    raw,
    url: 'http://localhost:8090',
    ...(truncated ? { truncated: true } : {}),
  };
  const parsed: ParsedMetrics | null = null;
  const sample: MonitorSample = { health: HEALTH, metrics, parsed, updatedAt: Date.now(), url: 'http://localhost:8090' };
  useMonitorStore.setState({ sample, lastUpdated: Date.now() });
}

describe('RawPrometheusPane', () => {
  afterEach(() => {
    cleanup();
    useMonitorStore.setState(useMonitorStore.getInitialState(), true);
  });

  it('AC-9: shows the raw text in a read-only, selectable pane', () => {
    seed('oms-outbox-pending 4\noms-order-events-total{event="X"} 5');
    const { container } = render(<RawPrometheusPane />);
    // The pane is collapsed by default; expand it.
    fireEvent.click(screen.getByRole('button', { name: /Raw Prometheus text/i }));
    // The <pre> holds the full text; assert on its content (lines may be separate text nodes).
    const pre = container.querySelector('pre') as HTMLElement;
    expect(pre).toBeTruthy();
    expect(pre.textContent).toContain('oms-outbox-pending 4');
    expect(pre.textContent).toContain('oms-order-events-total{event="X"} 5');
  });

  it('AC-9: shows a truncated notice when the response exceeded 5 MB', () => {
    seed('x'.repeat(6 * 1024 * 1024), true);
    const { container } = render(<RawPrometheusPane />);
    fireEvent.click(screen.getByRole('button', { name: /truncated/i }));
    expect(container.querySelector('[data-testid="monitor-truncated-notice"]')).toBeTruthy();
  });

  it('AC-9: does not throw on a very large string', () => {
    // 5 MB of text — the truncation cap. Rendering must not throw.
    seed('y'.repeat(5 * 1024 * 1024));
    expect(() => render(<RawPrometheusPane />)).not.toThrow();
  });

  it('AC-9: shows a placeholder when there is no metrics data', () => {
    seed(null);
    render(<RawPrometheusPane />);
    fireEvent.click(screen.getByRole('button', { name: /Raw Prometheus text/i }));
    expect(screen.getByText(/No metrics data/i)).toBeTruthy();
  });
});
