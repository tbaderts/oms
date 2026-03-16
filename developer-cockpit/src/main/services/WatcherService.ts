import { watch, type FSWatcher } from 'chokidar';
import type { WebSocketServer } from '../websocket/server';
import type { FileChangePayload } from '../../shared/types/events';

export class WatcherService {
  private watcher: FSWatcher | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceMs = 300;

  constructor(
    private workspaceRoot: string,
    private wsServer: WebSocketServer,
  ) {}

  start(): void {
    // Watch only the directories we care about rather than the entire workspace.
    // The full workspace contains ~100K files; scanning all of them at startup
    // blocks the Electron main process and makes the app feel sluggish.
    const watchPaths = [
      'oms-core/src',
      'oms-streaming-service/src',
      'oms-ui/frontend/src',
      'oms-knowledge-base',
      'developer-cockpit/src',
    ].map((p) => require('path').join(this.workspaceRoot, p));

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

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private debouncedEmit(filePath: string, kind: FileChangePayload['kind']): void {
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
}
