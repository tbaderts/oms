// SPEC-0074 AC-2, AC-3: one timeline from the order's event log and command log.
import { buildTimeline } from './orderHistory';
import { CommandLogEntry, OrderEventEntry } from '../types/types';

const event = (version: number, timeStamp: string, extra: Partial<OrderEventEntry> = {}): OrderEventEntry => ({
  orderId: 'ORD-1', version, event: `E${version}`, timeStamp, ...extra,
});

const command = (type: string, receivedAt: string, extra: Partial<CommandLogEntry> = {}): CommandLogEntry => ({
  type, receivedAt, outcome: 'APPLIED', ...extra,
});

describe('buildTimeline (SPEC-0074)', () => {
  it('joins an applied command to the event it appended, by eventVersion', () => {
    const timeline = buildTimeline(
      [event(1, '2026-11-25T09:00:00Z'), event(2, '2026-11-25T09:01:00Z')],
      [
        command('OrderCreateCmd', '2026-11-25T09:00:00Z', { eventVersion: 1 }),
        command('OrderAcceptCmd', '2026-11-25T09:01:00Z', { eventVersion: 2 }),
      ]);

    expect(timeline).toHaveLength(2);
    expect(timeline.map((e) => e.kind)).toEqual(['event', 'event']);
    expect(timeline[0]).toMatchObject({ kind: 'event', event: { version: 1 }, command: { type: 'OrderCreateCmd' } });
    expect(timeline[1]).toMatchObject({ kind: 'event', event: { version: 2 }, command: { type: 'OrderAcceptCmd' } });
  });

  it('falls back to the commandId for an applied command without eventVersion', () => {
    const timeline = buildTimeline(
      [event(1, '2026-11-25T09:00:00Z', { commandId: 'C-1' })],
      [command('OrderCreateCmd', '2026-11-25T09:00:00Z', { commandId: 'C-1' })]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ kind: 'event', command: { commandId: 'C-1' } });
  });

  it('keeps events in version order whatever the input order', () => {
    const timeline = buildTimeline(
      [event(3, '2026-11-25T09:03:00Z'), event(1, '2026-11-25T09:01:00Z'), event(2, '2026-11-25T09:02:00Z')],
      []);

    expect(timeline.map((e) => (e.kind === 'event' ? e.event.version : -1))).toEqual([1, 2, 3]);
  });

  it('places refused and failed commands by receivedAt among the events', () => {
    const timeline = buildTimeline(
      [event(1, '2026-11-25T09:00:00Z'), event(2, '2026-11-25T09:05:00Z')],
      [
        command('OrderCreateCmd', '2026-11-25T09:00:00Z', { eventVersion: 1 }),
        command('OrderReplaceRequestCmd', '2026-11-25T09:02:00Z', { outcome: 'REFUSED', reason: 'price out of band' }),
        command('OrderCancelRequestCmd', '2026-11-25T09:03:00Z', { outcome: 'FAILED', reason: 'timeout' }),
        command('OrderAcceptCmd', '2026-11-25T09:05:00Z', { eventVersion: 2 }),
        command('OrderCancelRequestCmd', '2026-11-25T09:09:00Z', { outcome: 'REFUSED', reason: 'already filled' }),
      ]);

    expect(timeline.map((e) => (e.kind === 'event' ? `v${e.event.version}` : `${e.command.outcome}:${e.command.reason}`)))
      .toEqual(['v1', 'REFUSED:price out of band', 'FAILED:timeout', 'v2', 'REFUSED:already filled']);
  });

  it('shows an applied command without a matching event on its own', () => {
    const timeline = buildTimeline([], [command('OrderCreateCmd', '2026-11-25T09:00:00Z', { eventVersion: 7 })]);

    expect(timeline).toEqual([{ kind: 'command', command: expect.objectContaining({ type: 'OrderCreateCmd' }) }]);
  });

  it('is empty for an order without history', () => {
    expect(buildTimeline([], [])).toEqual([]);
  });
});
