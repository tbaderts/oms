import { watch, type FSWatcher } from 'chokidar';
import * as path from 'path';
import type { WebSocketServer } from '../websocket/server';
import type { FileChangePayload, SpecTicketsChangedPayload } from '../../shared/types/events';

const SPEC_TICKET_DIRS = /^specs\/(changes|archive)\//;

export class WatcherService {
  private watcher: FSWatcher | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private specTicketsTimer: NodeJS.Timeout | null = null;
  private readonly debounceMs = 300;
  private extraPaths: string[] = [];
  private pathListeners = new Set<(filePath: string, kind: FileChangePayload['kind']) => void>();

  constructor(
    private workspaceRoot: string,
    private wsServer: WebSocketServer,
  ) {}

  start(): void {
    // Watch only the directories we care about rather than the entire workspace.
    // The full workspace contains ~100K files; scanning all of them at startup
    // blocks the Electron main process and makes the app feel sluggish.
    const watchPaths = [
      'oms-contracts/src/main',
      'oms-core/src',
      'oms-streaming-service/src',
      'oms-ui/frontend/src',
      'oms-knowledge-base',
      'developer-cockpit/src',
      'developer-cockpit/api-templates',
      'specs/changes',
      'specs/archive',
    ]
      .map((p) => path.join(this.workspaceRoot, p))
      .concat(this.extraPaths);

    this.watcher = watch(watchPaths, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.gradle/**',
        '**/*.class',
        '**/*.jar',
      ],
      persistent: true,
      ignoreInitial: true,
      depth: 10,
    });

    const events = ['change', 'add', 'unlink', 'addDir', 'unlinkDir'] as const;
    for (const eventName of events) {
      this.watcher.on(eventName, (filePath: string) => {
        this.debouncedEmit(filePath, eventName);
      });
    }

    this.watcher.on('error', (error) => {
      console.error('Watcher error:', error);
    });
  }

  /** Every raw change under the watched folders, before debouncing; returns an unsubscribe function. */
  onPath(listener: (filePath: string, kind: FileChangePayload['kind']) => void): () => void {
    this.pathListeners.add(listener);
    return () => this.pathListeners.delete(listener);
  }

  /** Files outside the fixed folders, such as extra API Explorer template sources; replaces the previous set. */
  setExtraPaths(paths: string[]): void {
    const previous = this.extraPaths;
    this.extraPaths = [...paths];
    if (!this.watcher) return; // applied by start()
    const removed = previous.filter((p) => !this.extraPaths.includes(p));
    const added = this.extraPaths.filter((p) => !previous.includes(p));
    if (removed.length) this.watcher.unwatch(removed);
    if (added.length) this.watcher.add(added);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    if (this.specTicketsTimer) clearTimeout(this.specTicketsTimer);
    this.specTicketsTimer = null;
  }

  private debouncedEmit(filePath: string, kind: FileChangePayload['kind']): void {
    for (const listener of this.pathListeners) listener(filePath, kind);
    if (SPEC_TICKET_DIRS.test(path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/'))) {
      this.emitSpecTicketsChanged(filePath);
    }

    const key = `${kind}:${filePath}`;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        const eventType = kind === 'change' ? 'file:changed' : kind === 'add' || kind === 'addDir' ? 'file:created' : 'file:deleted';
        this.wsServer.broadcast({
          type: eventType,
          timestamp: Date.now(),
          payload: { path: filePath, kind } satisfies FileChangePayload,
        });
      }, this.debounceMs),
    );
  }

  /** One trailing event per burst (e.g. `spec verify` writing logs), whatever the file. */
  private emitSpecTicketsChanged(filePath: string): void {
    if (this.specTicketsTimer) clearTimeout(this.specTicketsTimer);
    this.specTicketsTimer = setTimeout(() => {
      this.specTicketsTimer = null;
      this.wsServer.broadcast({
        type: 'specs:tickets-changed',
        timestamp: Date.now(),
        payload: { path: filePath } satisfies SpecTicketsChangedPayload,
      });
    }, this.debounceMs);
  }
}
