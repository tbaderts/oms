/**
 * Runs a callback before the next frame is painted (SPEC-0057). The live blotter applies all events
 * received since the last frame in that callback, as one grid transaction.
 *
 * A module of its own so that tests can hold frames back and run them one at a time.
 */
export function scheduleFrame(callback: () => void): void {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => callback());
  } else {
    setTimeout(callback, 16);
  }
}
