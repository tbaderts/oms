// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ServiceTile } from '../../src/renderer/views/monitor/ServiceBoard';
import { PanelGrid } from '../../src/renderer/views/monitor/PanelGrid';
import { formatValue, sparkPoints } from '../../src/renderer/views/monitor/charts';
import { projectConfigSchema } from '../../src/shared/projectConfig';
import type { HistoryEntry } from '../../src/renderer/stores/monitor';

const service = projectConfigSchema.parse({
  monitoring: { services: [{ name: 'api', check: { kind: 'http', url: 'http://localhost:8000/' }, links: [{ label: 'Docs', url: 'http://localhost:8000/docs' }] }] },
}).monitoring.services[0];

describe('monitor tiles', () => {
  afterEach(cleanup);

  it('tileShowsSparklineAndHistoryStrip', () => {
    const history: HistoryEntry[] = [
      { status: 'UP', latencyMs: 10, at: 1 },
      { status: 'UP', latencyMs: 30, at: 2 },
      { status: 'DOWN', latencyMs: 20, at: 3 },
    ];
    render(<ServiceTile service={service} check={{ name: 'api', status: 'DOWN', latencyMs: 20, checkedAt: 3, target: 'http://localhost:8000/', reason: 'HTTP 503' }} history={history} />);

    const line = screen.getByTestId('service-sparkline').querySelector('polyline')!;
    expect(line.getAttribute('points')).toBe(sparkPoints([10, 30, 20], 110, 24));
    expect(line.getAttribute('points')!.split(' ')).toHaveLength(3);

    const cells = within(screen.getByTestId('history-strip')).getAllByTitle(/UP|DOWN/);
    expect(cells.map((c) => c.getAttribute('data-status'))).toEqual(['UP', 'UP', 'DOWN']);
    expect(screen.getByText('20 ms')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Docs/ })).toBeTruthy();
  });

  it('a tile without enough history says it is collecting', () => {
    render(<ServiceTile service={service} history={[{ status: 'UP', latencyMs: 5, at: 1 }]} />);
    expect(screen.getByTestId('service-sparkline').textContent).toBe('collecting…');
    expect(screen.getByTestId('service-tile').getAttribute('data-status')).toBe('pending');
  });

  it('panelsRenderStubValues', () => {
    render(
      <PanelGrid
        panels={[
          { title: 'Up', type: 'stat', unit: 'count', ok: true, value: 7 },
          { title: 'p99', type: 'stat', unit: 's', ok: true, value: 0.25 },
          { title: 'Jobs', type: 'bars', unit: 'count', ok: true, bars: [{ label: 'queued', value: 4 }, { label: 'running', value: 2 }] },
          { title: 'Rate', type: 'timeseries', unit: 'perMinute', ok: true, series: [{ t: 1, value: 10 }, { t: 2, value: 60 }] },
          { title: 'Broken', type: 'stat', unit: 'count', ok: false, error: 'Query failed: parse error' },
          { title: 'Empty', type: 'stat', unit: 'count', ok: true, value: null },
        ]}
      />,
    );
    const panel = (title: string) => screen.getAllByTestId('panel').find((p) => p.getAttribute('data-panel') === title)!;
    expect(within(panel('Up')).getByTestId('panel-value').textContent).toBe('7');
    expect(within(panel('p99')).getByTestId('panel-value').textContent).toBe('250 ms');
    expect(within(panel('Jobs')).getAllByTestId('panel-bar').map((b) => b.textContent)).toEqual(['queued4', 'running2']);
    expect(within(panel('Rate')).getByTestId('panel-value').textContent).toBe('60 /min');
    expect(within(panel('Rate')).getByTestId('panel-series').querySelector('polyline')).toBeTruthy();
    expect(within(panel('Broken')).getByTestId('panel-error').textContent).toBe('Query failed: parse error');
    expect(within(panel('Empty')).getByTestId('panel-value').textContent).toBe('no data');
  });

  it('formats values by unit', () => {
    expect(formatValue(1234, 'ms')).toBe('1.23 s');
    expect(formatValue(12.34, 'ms')).toBe('12.3 ms');
    expect(formatValue(2.5, 's')).toBe('2.5 s');
    expect(formatValue(12.345, 'percent')).toBe('12.3%');
    expect(formatValue(3 * 1024 * 1024, 'bytes')).toBe('3 MB');
    expect(formatValue(25_000, 'count')).toBe('25k');
    expect(formatValue(null, 'count')).toBe('—');
  });
});
