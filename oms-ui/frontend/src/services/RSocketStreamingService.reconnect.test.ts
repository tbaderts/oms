// RSocketStreamingService.reconnect.test.ts - A connection that drops (server restart, network
// blip, missed keep-alives) is noticed and re-established on its own; one the user closed is not.
import { RSocketStreamingService } from './RSocketStreamingService';

/** One fake RSocket connection: its status stream can be driven by the test. */
interface FakeSocket {
  emitStatus: (status: { kind: string; error?: Error }) => void;
  closed: boolean;
}

let mockSockets: FakeSocket[] = [];
let mockConnectOutcomes: Array<'ok' | 'fail'> = [];

jest.mock('rsocket-websocket-client', () => ({ __esModule: true, default: function FakeTransport() { return {}; } }));
jest.mock('rsocket-core', () => {
  const actual = jest.requireActual('rsocket-core');
  class FakeClient {
    connect() {
      return {
        subscribe: (subscriber: any) => {
          subscriber.onSubscribe?.(() => undefined);
          const outcome = mockConnectOutcomes.shift() ?? 'ok';
          if (outcome === 'fail') {
            subscriber.onError(new Error('connection refused'));
            return;
          }
          let statusSubscriber: any = null;
          const socket: FakeSocket & Record<string, any> = {
            closed: false,
            emitStatus: (status) => statusSubscriber?.onNext(status),
            connectionStatus: () => ({
              subscribe: (s: any) => {
                statusSubscriber = s;
                s.onSubscribe?.({ request: () => undefined, cancel: () => { statusSubscriber = null; } });
                s.onNext({ kind: 'CONNECTED' });
              },
            }),
            close: () => {
              socket.closed = true;
              socket.emitStatus({ kind: 'CLOSED' });
            },
          };
          mockSockets.push(socket);
          subscriber.onComplete(socket);
        },
      };
    }
    close() { /* the socket closes the transport */ }
  }
  return { ...actual, RSocketClient: FakeClient };
});

describe('RSocketStreamingService reconnect', () => {
  let service: RSocketStreamingService;
  let states: string[];

  beforeEach(() => {
    jest.useFakeTimers();
    mockSockets = [];
    mockConnectOutcomes = [];
    (RSocketStreamingService as any).instance = null;
    service = RSocketStreamingService.getInstance({ wsUrl: 'ws://test', reconnectDelayMs: 1000 });
    states = [];
    service.addConnectionStateListener((s) => states.push(s));
  });

  afterEach(() => {
    service.disconnect();
    jest.useRealTimers();
  });

  /** Runs pending timers and lets the promises they start settle. */
  const advance = async (ms: number) => {
    const step = 250;
    for (let elapsed = 0; elapsed < ms; elapsed += step) {
      jest.advanceTimersByTime(Math.min(step, ms - elapsed));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    }
  };

  it.each([
    ['closes', { kind: 'CLOSED' }],
    ['fails', { kind: 'ERROR', error: new Error('No keep-alive acks for 180000 millis') }],
  ])('reports a connection that %s and re-establishes it', async (_name, status) => {
    await service.connect();
    expect(service.getConnectionState()).toBe('connected');

    mockSockets[0].emitStatus(status);

    expect(service.getConnectionState()).toBe('reconnecting');
    await advance(1000);
    expect(mockSockets).toHaveLength(2);
    expect(service.getConnectionState()).toBe('connected');
    expect(states.slice(-2)).toEqual(['connecting', 'connected']);
  });

  it('keeps retrying with backoff until the server is back, then starts again from the first delay', async () => {
    await service.connect();
    mockConnectOutcomes = Array(15).fill('fail');

    mockSockets[0].emitStatus({ kind: 'CLOSED' });
    // Delays 1, 2, 4, 8, then 16 s each: 15 failed attempts, more than the old limit of 10, take
    // 191 s, and it is still trying.
    await advance(191_000);
    expect(mockConnectOutcomes).toHaveLength(0);
    expect(service.getConnectionState()).toBe('reconnecting');

    await advance(16_000);
    expect(service.getConnectionState()).toBe('connected');

    // The next drop retries after the first delay again.
    mockSockets[mockSockets.length - 1].emitStatus({ kind: 'CLOSED' });
    await advance(1000);
    expect(service.getConnectionState()).toBe('connected');
  });

  it('does not reconnect a connection the user closed', async () => {
    await service.connect();

    service.disconnect();
    await advance(60_000);

    expect(mockSockets[0].closed).toBe(true);
    expect(mockSockets).toHaveLength(1);
    expect(service.getConnectionState()).toBe('disconnected');
  });

  it('a Connect during a pending retry connects once and cancels the retry', async () => {
    await service.connect();
    mockSockets[0].emitStatus({ kind: 'CLOSED' });

    await service.connect();
    await advance(60_000);

    expect(mockSockets).toHaveLength(2);
    expect(service.getConnectionState()).toBe('connected');
  });

  it('concurrent connects share one connection', async () => {
    await Promise.all([service.connect(), service.connect()]);

    expect(mockSockets).toHaveLength(1);
  });

  it('a stale status from a replaced connection changes nothing', async () => {
    await service.connect();
    const old = mockSockets[0];
    old.emitStatus({ kind: 'CLOSED' });
    await advance(1000);
    expect(service.getConnectionState()).toBe('connected');

    old.emitStatus({ kind: 'ERROR', error: new Error('late') });

    expect(service.getConnectionState()).toBe('connected');
    await advance(60_000);
    expect(mockSockets).toHaveLength(2);
  });
});
