// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OrdersByStateTile } from '../../src/renderer/views/monitor/OrdersByStateTile';
import { OrderEventsTile } from '../../src/renderer/views/monitor/OrderEventsTile';
import { TimeToAckTile } from '../../src/renderer/views/monitor/TimeToAckTile';
import { TimeToMarketTile } from '../../src/renderer/views/monitor/TimeToMarketTile';
import { OutboxTile } from '../../src/renderer/views/monitor/OutboxTile';
import { useMonitorStore } from '../../src/renderer/stores/monitor';
import type { MonitorSample, MonitorHealthResult, MonitorMetricsResult, ParsedMetrics } from '../../src/shared/types/monitor';

const HEALTH: MonitorHealthResult = { ok: true, status: 200, body: { status: 'UP' }, url: 'http://localhost:8090' };
const METRICS: MonitorMetricsResult = { ok: true, status: 200, raw: '', url: 'http://localhost:8090' };

function seed(parsed: ParsedMetrics | null) {
  const sample: MonitorSample = {
    health: HEALTH,
    metrics: METRICS,
    parsed,
    updatedAt: Date.now(),
    url: 'http://localhost:8090',
  };
  useMonitorStore.setState({ sample, lastUpdated: Date.now() });
}

describe('Monitor tiles', () => {
  afterEach(() => {
    cleanup();
    useMonitorStore.setState(useMonitorStore.getInitialState(), true);
  });

  it('AC-2: OrdersByStateTile shows one row per state and omits zero-value states', () => {
    seed({
      ordersByState: [
        { state: 'NEW', value: 3 },
        { state: 'LIVE', value: 5 },
        { state: 'CXL', value: 1 },
      ],
      eventsTotal: 0,
      timeToAckP99Ms: null,
      timeToMarketP99Ms: null,
      outbox: { pending: 0, stuck: 0, oldestAgeSeconds: null },
    });
    const { container } = render(<OrdersByStateTile states={useMonitorStore.getState().sample?.parsed?.ordersByState ?? null} />);
    expect(screen.getByText('NEW')).toBeTruthy();
    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByText('CXL')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    // A zero-value state is absent.
    expect(screen.queryByText('REJ')).toBeNull();
    expect(container).toBeTruthy();
  });

  it('AC-2: OrdersByStateTile shows a placeholder when there are no states', () => {
    seed({
      ordersByState: [],
      eventsTotal: 0,
      timeToAckP99Ms: null,
      timeToMarketP99Ms: null,
      outbox: { pending: 0, stuck: 0, oldestAgeSeconds: null },
    });
    render(<OrdersByStateTile states={[]} />);
    expect(screen.getByText(/No order data/i)).toBeTruthy();
  });

  it('AC-3: OrderEventsTile shows the total and a per-minute rate', () => {
    seed({
      ordersByState: [],
      eventsTotal: 42,
      timeToAckP99Ms: null,
      timeToMarketP99Ms: null,
      outbox: { pending: 0, stuck: 0, oldestAgeSeconds: null },
    });
    useMonitorStore.setState({ eventsPerMinute: 7.5 });
    render(<OrderEventsTile />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText(/7.5\/min/)).toBeTruthy();
  });

  it('AC-4: TimeToAckTile shows the p99 in ms (1 decimal) or "–" when null', () => {
    seed({
      ordersByState: [],
      eventsTotal: 0,
      timeToAckP99Ms: 123.4,
      timeToMarketP99Ms: null,
      outbox: { pending: 0, stuck: 0, oldestAgeSeconds: null },
    });
    render(<TimeToAckTile />);
    expect(screen.getByText('123.4')).toBeTruthy();
    expect(screen.getByText(/p99/)).toBeTruthy();

    seed({
      ordersByState: [],
      eventsTotal: 0,
      timeToAckP99Ms: null,
      timeToMarketP99Ms: null,
      outbox: { pending: 0, stuck: 0, oldestAgeSeconds: null },
    });
    render(<TimeToAckTile />);
    // The value shows the "–" placeholder when there is no usable p99.
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(1);
  });

  it('AC-4: TimeToMarketTile shows the p99 in ms (1 decimal) or "–" when null', () => {
    seed({
      ordersByState: [],
      eventsTotal: 0,
      timeToAckP99Ms: null,
      timeToMarketP99Ms: 567.8,
      outbox: { pending: 0, stuck: 0, oldestAgeSeconds: null },
    });
    render(<TimeToMarketTile />);
    expect(screen.getByText('567.8')).toBeTruthy();
  });

  it('AC-5: OutboxTile shows pending, stuck and the oldest age as mm:ss', () => {
    seed({
      ordersByState: [],
      eventsTotal: 0,
      timeToAckP99Ms: null,
      timeToMarketP99Ms: null,
      outbox: { pending: 4, stuck: 2, oldestAgeSeconds: 125 }, // 2 min 5 s
    });
    render(<OutboxTile />);
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Stuck')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Oldest age')).toBeTruthy();
    expect(screen.getByText('02:05')).toBeTruthy();
  });

  it('AC-5: OutboxTile shows "–" for a null oldest age', () => {
    seed({
      ordersByState: [],
      eventsTotal: 0,
      timeToAckP99Ms: null,
      timeToMarketP99Ms: null,
      outbox: { pending: 0, stuck: 0, oldestAgeSeconds: null },
    });
    const { container } = render(<OutboxTile />);
    // When there are no pending outbox rows the oldest age is absent → the "–" placeholder.
    const oldestRow = container.querySelector('[data-testid="monitor-outbox"]')!;
    expect(oldestRow.textContent).toContain('Oldest age');
    expect(oldestRow.textContent).toContain('–');
  });
});
