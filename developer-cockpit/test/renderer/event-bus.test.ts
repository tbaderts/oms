import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/renderer/lib/event-bus';
import type { CockpitEvent } from '../../src/shared/types/events';

/** A WebSocket stand-in whose open and close the test triggers, in the order the bug needs. */
class FakeSocket {
  static created: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closeCalled = false;

  constructor(public url: string) {
    FakeSocket.created.push(this);
  }

  close(): void {
    this.closeCalled = true;
  }

  open(): void {
    this.onopen?.();
  }

  /** The close event, which a real socket delivers some time after close() or a server drop. */
  closed(): void {
    this.onclose?.();
  }
}

const URL = 'ws://127.0.0.1:9321';

describe('EventBus connection handling (SPEC-0036)', () => {
  let bus: EventBus;
  let statuses: boolean[];

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.created = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    bus = new EventBus();
    statuses = [];
    bus.on('connection:status', (e: CockpitEvent) => statuses.push((e.payload as { connected: boolean }).connected));
  });

  afterEach(() => {
    bus.disconnect();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('double connect settles on one open socket', () => {
    bus.connect(URL);
    bus.connect(URL);
    const [first, second] = FakeSocket.created;
    expect(first.closeCalled).toBe(true);

    second.open();
    first.closed(); // the replaced socket's close arrives late, after the new one opened

    expect(bus.connected).toBe(true);
    expect(statuses.at(-1)).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.created).toHaveLength(2);
    expect(second.closeCalled).toBe(false);
    expect(bus.connected).toBe(true);
  });

  it('a real close reports Disconnected and reconnects after 3 s', () => {
    bus.connect(URL);
    FakeSocket.created[0].open();

    FakeSocket.created[0].closed();
    expect(bus.connected).toBe(false);
    expect(statuses.at(-1)).toBe(false);

    vi.advanceTimersByTime(2_900);
    expect(FakeSocket.created).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(FakeSocket.created).toHaveLength(2);

    FakeSocket.created[1].open();
    expect(bus.connected).toBe(true);
    expect(statuses.at(-1)).toBe(true);
  });

  it('disconnect closes without events or reconnect', () => {
    bus.connect(URL);
    const socket = FakeSocket.created[0];
    socket.open();
    const before = statuses.length;

    bus.disconnect();
    expect(socket.closeCalled).toBe(true);
    socket.closed();

    expect(statuses).toHaveLength(before);
    expect(bus.connected).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.created).toHaveLength(1);
  });
});
