import * as fs from 'fs';
import * as path from 'path';
import type { AiUsageEntry, AiUsageSummary } from '../../shared/types/ai';

export const USAGE_FILE = 'ai-usage.json';
export const MAX_USAGE_ENTRIES = 1000;

/**
 * Appends one usage entry per completed AI run to `<configDir>/ai-usage.json` (AC-7) and exposes
 * the accumulated totals for the Settings summary.
 *
 * The file is single-writer (main process only); writes go through a temp file + rename so a crash
 * never leaves a half-written file (same pattern as ApiHistoryService). The file is capped at
 * MAX_USAGE_ENTRIES with the oldest entries dropping first, bounding its size. An unreadable or
 * corrupt file is treated as empty rather than thrown on.
 */
export class AiUsageTracker {
  private file: string;
  private warned = false;

  constructor(private configDir: string) {
    this.file = path.join(configDir, USAGE_FILE);
  }

  /** Appends an entry, re-capping the file at MAX_USAGE_ENTRIES (FIFO). */
  record(entry: AiUsageEntry): void {
    const entries = [...this.read(), entry].slice(-MAX_USAGE_ENTRIES);
    this.write(entries);
  }

  /** Totals across all recorded entries, for the Settings "AI usage" block. */
  summary(): AiUsageSummary {
    const entries = this.read();
    return {
      entries: entries.length,
      totalInput: entries.reduce((sum, e) => sum + (e.inputTokens || 0), 0),
      totalOutput: entries.reduce((sum, e) => sum + (e.outputTokens || 0), 0),
    };
  }

  private read(): AiUsageEntry[] {
    if (!fs.existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      if (!Array.isArray(parsed)) throw new Error('not an array');
      return parsed as AiUsageEntry[];
    } catch (err) {
      if (!this.warned) console.warn(`[ai] usage file unreadable, starting empty: ${(err as Error).message}`);
      this.warned = true;
      return [];
    }
  }

  /** Write to a temp file and rename, so a crash never leaves a half-written usage log. */
  private write(entries: AiUsageEntry[]): void {
    fs.mkdirSync(this.configDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf-8');
    fs.renameSync(tmp, this.file);
  }
}
