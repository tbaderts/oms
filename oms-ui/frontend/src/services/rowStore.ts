/**
 * The live blotter's rows (SPEC-0057), kept outside React state so an event costs O(1) and the grid
 * is told only what changed.
 *
 * - **Least recently updated eviction.** `rows` is a Map in update order: `put` deletes and re-sets
 *   a key, so a busy row moves to the newest end, and the row that went longest without an update is
 *   evicted first when the store exceeds its cap.
 * - **Delta against the grid.** `grid` holds what the grid was last given; `dirty` the keys changed
 *   since. `takeDelta()` turns them into one AG Grid transaction (add / update / remove). A key
 *   evicted before the grid saw it is forgotten, so `dirty` never exceeds `rows ∪ grid`, at most
 *   twice the cap, however long the grid is held back (paused, hidden, a background tab).
 * - **Bulk snapshot.** Between `beginSnapshot()` and `endSnapshot()` rows are collected aside, at
 *   most the cap. The server sends them newest first, so the first `cap` are the newest; they are
 *   inserted oldest first, so the newest snapshot row counts as the most recently updated.
 */
export interface RowDelta<T> {
  add: T[];
  update: T[];
  remove: T[];
}

export class RowStore<T> {
  private rows = new Map<string, T>();
  private grid = new Map<string, T>();
  private dirty = new Set<string>();
  private snapshot: Array<[string, T]> | null = null;
  /** What the last takeDelta changed in `grid`, so a refused transaction can be put back. */
  private lastTaken: { added: string[]; updated: string[]; removed: Array<[string, T]> } = { added: [], updated: [], removed: [] };

  constructor(private cap: number) {}

  /** The most rows held. */
  get capacity(): number {
    return this.cap;
  }

  /** Rows held, at most the cap. */
  get size(): number {
    return this.rows.size;
  }

  /** Keys the next delta will carry; bounded by twice the cap. */
  get pendingKeys(): number {
    return this.dirty.size;
  }

  get inSnapshot(): boolean {
    return this.snapshot !== null;
  }

  /** The rows, least recently updated first. */
  values(): T[] {
    return Array.from(this.rows.values());
  }

  setCap(cap: number): void {
    this.cap = Math.max(0, cap);
    this.evict();
  }

  /** A live row: replaces any earlier state and becomes the most recently updated. */
  put(key: string, row: T): void {
    if (this.snapshot !== null) {
      // A live event before the marker (an older server): the snapshot is over.
      this.endSnapshot();
    }
    this.rows.delete(key);
    this.rows.set(key, row);
    this.dirty.delete(key);
    this.dirty.add(key);
    this.evict();
  }

  beginSnapshot(): void {
    this.snapshot = [];
  }

  /** A snapshot row, newest first; rows beyond the cap are older than those kept and are dropped. */
  putSnapshot(key: string, row: T): void {
    if (this.snapshot === null) {
      this.put(key, row);
    } else if (this.snapshot.length < this.cap) {
      this.snapshot.push([key, row]);
    }
  }

  endSnapshot(): void {
    const collected = this.snapshot;
    this.snapshot = null;
    if (collected === null) {
      return;
    }
    for (let i = collected.length - 1; i >= 0; i--) {
      this.put(collected[i][0], collected[i][1]);
    }
  }

  /** What changed since the last call, as one grid transaction; the grid is then up to date. */
  takeDelta(): RowDelta<T> {
    const delta: RowDelta<T> = { add: [], update: [], remove: [] };
    const taken: { added: string[]; updated: string[]; removed: Array<[string, T]> } = { added: [], updated: [], removed: [] };
    this.dirty.forEach(key => {
      if (this.rows.has(key)) {
        const row = this.rows.get(key) as T;
        if (this.grid.has(key)) {
          delta.update.push(row);
          taken.updated.push(key);
        } else {
          delta.add.push(row);
          taken.added.push(key);
        }
        this.grid.set(key, row);
      } else if (this.grid.has(key)) {
        const shown = this.grid.get(key) as T;
        delta.remove.push(shown);
        taken.removed.push([key, shown]);
        this.grid.delete(key);
      }
    });
    this.dirty.clear();
    this.lastTaken = taken;
    return delta;
  }

  /**
   * The grid refused the last delta (SPEC-0057): it holds what it held before, so the store must not
   * believe otherwise. Those rows are marked dirty again and go into the next delta.
   */
  rejectLastDelta(): void {
    const { added, updated, removed } = this.lastTaken;
    added.forEach(key => {
      this.grid.delete(key);
      this.dirty.add(key);
    });
    updated.forEach(key => this.dirty.add(key));
    removed.forEach(([key, row]) => {
      this.grid.set(key, row);
      this.dirty.add(key);
    });
    this.lastTaken = { added: [], updated: [], removed: [] };
  }

  /**
   * A snapshot row that arrives after the snapshot was shown (the quiet fallback fired while a slow
   * page was on its way). It is older than every row held, since the snapshot comes newest first:
   * it takes a free slot at the oldest end, never evicts a newer row, and never replaces a held
   * row, whose state is at least as new.
   */
  putOldest(key: string, row: T): void {
    if (this.rows.has(key) || this.rows.size >= this.cap) {
      return;
    }
    this.rows = new Map([[key, row], ...Array.from(this.rows)]);
    this.dirty.add(key);
  }

  /** Drops every row (a new subscription); the next delta removes what the grid holds. */
  clear(): void {
    this.rows.clear();
    this.snapshot = null;
    this.dirty = new Set(this.grid.keys());
  }

  private evict(): void {
    while (this.rows.size > this.cap) {
      const oldest = this.rows.keys().next().value as string;
      this.rows.delete(oldest);
      if (this.grid.has(oldest)) {
        this.dirty.add(oldest);
      } else {
        this.dirty.delete(oldest);
      }
    }
  }
}
