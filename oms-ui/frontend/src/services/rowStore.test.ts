import { RowStore } from './rowStore';

// SPEC-0057: the live blotter's rows, outside React state. Least-recently-updated eviction, a delta
// against what the grid holds, bounded however long the grid is held back, and a bulk snapshot.

type Row = { id: string; v: number };
const row = (id: string, v = 1): Row => ({ id, v });
const ids = (rows: Row[]) => rows.map(r => r.id);

describe('RowStore', () => {
  // AC-2
  it('evicts the least recently updated row', () => {
    const store = new RowStore<Row>(3);
    store.put('A', row('A'));
    store.put('B', row('B'));
    store.put('C', row('C'));
    expect(ids(store.takeDelta().add)).toEqual(['A', 'B', 'C']);

    store.put('A', row('A', 2)); // A is busy: it moves to the newest end
    store.put('D', row('D'));

    expect(ids(store.values())).toEqual(['C', 'A', 'D']);
    const delta = store.takeDelta();
    expect(delta.add).toEqual([row('D')]);
    expect(delta.update).toEqual([row('A', 2)]);
    expect(delta.remove).toEqual([row('B')]);
  });

  it('sends only the latest state of a row updated several times before a flush', () => {
    const store = new RowStore<Row>(10);
    store.put('A', row('A', 1));
    store.put('A', row('A', 2));
    store.put('A', row('A', 3));

    expect(store.takeDelta()).toEqual({ add: [row('A', 3)], update: [], remove: [] });
    expect(store.takeDelta()).toEqual({ add: [], update: [], remove: [] });
  });

  it('does not tell the grid about a row added and evicted between two flushes', () => {
    const store = new RowStore<Row>(1);
    store.put('A', row('A'));
    store.put('B', row('B'));

    expect(store.takeDelta()).toEqual({ add: [row('B')], update: [], remove: [] });
  });

  // AC-7, AC-10: held back (paused, hidden or in a background tab), the store stays bounded.
  it('stays bounded while held', () => {
    const store = new RowStore<Row>(3);
    ['A', 'B', 'C'].forEach(id => store.put(id, row(id)));
    store.takeDelta();

    for (let i = 0; i < 10_000; i++) {
      store.put(`K${i}`, row(`K${i}`, i));
    }

    expect(store.size).toBe(3);
    expect(store.pendingKeys).toBeLessThanOrEqual(6);
    const delta = store.takeDelta();
    expect(ids(delta.add)).toEqual(['K9997', 'K9998', 'K9999']);
    expect(ids(delta.remove).sort()).toEqual(['A', 'B', 'C']);
    expect(delta.update).toEqual([]);
  });

  // AC-5
  it('loads the snapshot in bulk keeping the newest', () => {
    const store = new RowStore<Row>(2);
    store.beginSnapshot();
    // The server sends the snapshot newest first.
    store.putSnapshot('S3', row('S3'));
    store.putSnapshot('S2', row('S2'));
    store.putSnapshot('S1', row('S1')); // beyond the cap: older than the rows kept
    expect(store.inSnapshot).toBe(true);
    expect(store.takeDelta()).toEqual({ add: [], update: [], remove: [] });

    store.endSnapshot();

    expect(store.inSnapshot).toBe(false);
    // Oldest first, so the newest snapshot row counts as the most recently updated.
    expect(ids(store.values())).toEqual(['S2', 'S3']);
    expect(ids(store.takeDelta().add)).toEqual(['S2', 'S3']);
    store.put('L1', row('L1'));
    expect(ids(store.values())).toEqual(['S3', 'L1']);
  });

  it('a live update of a snapshot row during the snapshot keeps the newer state', () => {
    const store = new RowStore<Row>(5);
    store.beginSnapshot();
    store.putSnapshot('S1', row('S1', 1));
    store.put('S1', row('S1', 2)); // a live event before the marker: the snapshot ends first
    expect(store.inSnapshot).toBe(false);

    expect(store.values()).toEqual([row('S1', 2)]);
  });

  it('clear removes everything the grid holds', () => {
    const store = new RowStore<Row>(5);
    store.put('A', row('A'));
    store.put('B', row('B'));
    store.takeDelta();

    store.clear();

    expect(store.size).toBe(0);
    expect(ids(store.takeDelta().remove).sort()).toEqual(['A', 'B']);
  });

  it('a lower cap evicts at once', () => {
    const store = new RowStore<Row>(5);
    ['A', 'B', 'C', 'D'].forEach(id => store.put(id, row(id)));

    store.setCap(2);

    expect(ids(store.values())).toEqual(['C', 'D']);
  });
});

// SPEC-0057 (review): a snapshot row arriving after the snapshot was shown (a slow page made
// the quiet fallback fire) is older than every row held: it may fill a free slot at the old end,
// but never evicts a newer row.
describe('RowStore late snapshot rows', () => {
  it('puts a late snapshot row at the old end and never evicts a newer one', () => {
    const store = new RowStore<Row>(3);
    store.beginSnapshot();
    store.putSnapshot('S5', row('S5'));
    store.putSnapshot('S4', row('S4'));
    store.endSnapshot();
    store.takeDelta();

    store.putOldest('S3', row('S3'));
    store.putOldest('S2', row('S2')); // full: older than all three held
    store.putOldest('S4', row('S4', 9)); // already held: the held state is newer

    expect(ids(store.values())).toEqual(['S3', 'S4', 'S5']);
    expect(store.values()[1].v).toBe(1);
    expect(store.takeDelta()).toEqual({ add: [row('S3')], update: [], remove: [] });
  });
});

// SPEC-0057 (review): when the grid refuses a transaction the store must not believe it
// holds those rows; the next delta carries them again.
describe('RowStore refused delta', () => {
  it('puts back adds, updates and removes', () => {
    const store = new RowStore<Row>(2);
    store.put('A', row('A'));
    store.put('B', row('B'));
    store.takeDelta();

    store.put('B', row('B', 2));
    store.put('C', row('C')); // evicts A
    const delta = store.takeDelta();
    expect(delta).toEqual({ add: [row('C')], update: [row('B', 2)], remove: [row('A')] });

    store.rejectLastDelta();

    expect(store.takeDelta()).toEqual(delta);
  });
});
