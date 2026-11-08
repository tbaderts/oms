/**
 * Rolling-window eviction for the streaming blotters (SPEC-0054).
 *
 * JS Maps preserve insertion order, so the first key is the oldest row.
 * Evicting from the front keeps the newest `maxRows` entries in memory.
 */
export function evictOldest<T>(map: Map<string, T>, maxRows: number): void {
  if (maxRows <= 0) {
    map.clear();
    return;
  }
  while (map.size > maxRows) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    map.delete(oldestKey);
  }
}
