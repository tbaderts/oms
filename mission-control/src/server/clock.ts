/** Epoch milliseconds with sub-millisecond precision. Injected so tests can control time. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => performance.timeOrigin + performance.now(),
};
