import { evictOldest } from './rollingWindow';

describe('evictOldest (SPEC-0054)', () => {
  it('keeps every entry when the map is below the limit', () => {
    const map = new Map<string, number>([['a', 1], ['b', 2]]);
    evictOldest(map, 3);
    expect(map.size).toBe(2);
  });

  it('evicts the first-inserted keys until the map is at the limit', () => {
    const map = new Map<string, number>([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
    evictOldest(map, 2);
    expect([...map.keys()]).toEqual(['c', 'd']);
  });

  it('is a no-op when the map is exactly at the limit', () => {
    const map = new Map<string, number>([['a', 1], ['b', 2]]);
    evictOldest(map, 2);
    expect([...map.keys()]).toEqual(['a', 'b']);
  });

  it('handles an empty map', () => {
    const map = new Map<string, number>();
    evictOldest(map, 5);
    expect(map.size).toBe(0);
  });
});
