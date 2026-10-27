import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { HistoryEntry } from '../../shared/apiExplorer';

export const HISTORY_FILE = 'api-explorer-history.json';
export const MAX_ENTRIES = 100;
export const MAX_BODY_CHARS = 64 * 1024;

/** The API Explorer's per-user request history, newest first, next to the cockpit config. */
export class ApiHistoryService {
  private file: string;
  private warned = false;

  constructor(private configDir: string = path.join(os.homedir(), '.developer-cockpit')) {
    this.file = path.join(configDir, HISTORY_FILE);
  }

  list(): HistoryEntry[] {
    if (!fs.existsSync(this.file)) return [];
    try {
      const entries = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      if (!Array.isArray(entries)) throw new Error('not an array');
      return entries as HistoryEntry[];
    } catch (err) {
      if (!this.warned) console.warn(`[api-explorer] history unreadable, starting empty: ${(err as Error).message}`);
      this.warned = true;
      return [];
    }
  }

  add(entry: Omit<HistoryEntry, 'id' | 'at'>): HistoryEntry {
    let request = entry.request;
    if ('body' in request && request.body.length > MAX_BODY_CHARS) {
      request = { body: request.body.slice(0, MAX_BODY_CHARS), truncated: true };
    }
    const full: HistoryEntry = { id: randomUUID(), at: new Date().toISOString(), ...entry, request };
    this.write([full, ...this.list()].slice(0, MAX_ENTRIES));
    return full;
  }

  clear(): void {
    this.write([]);
  }

  /** Write to a temp file and rename, so a crash never leaves a half-written history. */
  private write(entries: HistoryEntry[]): void {
    fs.mkdirSync(this.configDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf-8');
    fs.renameSync(tmp, this.file);
  }
}
