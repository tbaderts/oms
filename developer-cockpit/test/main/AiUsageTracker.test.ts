import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiUsageTracker, USAGE_FILE, MAX_USAGE_ENTRIES } from '../../src/main/ai/AiUsageTracker';
import type { AiUsageEntry } from '../../src/shared/types/ai';

const entry = (i: number, overrides: Partial<AiUsageEntry> = {}): AiUsageEntry => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  feature: 'assistant',
  inputTokens: 10 + i,
  outputTokens: 10 + i,
  ...overrides,
});

describe('AiUsageTracker (AC-7)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-ai-usage-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('records entries to ai-usage.json and summary() reflects them', () => {
    const tracker = new AiUsageTracker(dir);
    tracker.record(entry(0));
    tracker.record(entry(1));

    const file = path.join(dir, USAGE_FILE);
    expect(fs.existsSync(file)).toBe(true);
    const stored = JSON.parse(fs.readFileSync(file, 'utf-8')) as AiUsageEntry[];
    expect(stored).toHaveLength(2);
    expect(stored[0]).toEqual(entry(0));
    expect(stored[1]).toEqual(entry(1));

    const summary = tracker.summary();
    expect(summary).toEqual({ entries: 2, totalInput: 21, totalOutput: 21 });
  });

  it('caps the file at MAX_USAGE_ENTRIES with FIFO (oldest entries drop first)', () => {
    const file = path.join(dir, USAGE_FILE);
    const seed = Array.from({ length: MAX_USAGE_ENTRIES + 1 }, (_, i) => entry(i));
    fs.writeFileSync(file, JSON.stringify(seed));

    const tracker = new AiUsageTracker(dir);
    tracker.record(entry(1000));
    const stored = JSON.parse(fs.readFileSync(file, 'utf-8')) as AiUsageEntry[];
    expect(stored).toHaveLength(MAX_USAGE_ENTRIES);
    // the oldest entry (i=0) was dropped, the new one (i=1000) is last
    expect(stored[0]).toEqual(entry(2));
    expect(stored[stored.length - 1]).toEqual(entry(1000));
    expect(tracker.summary().entries).toBe(MAX_USAGE_ENTRIES);
  });

  it('treats a corrupt file as empty instead of throwing', () => {
    const file = path.join(dir, USAGE_FILE);
    fs.writeFileSync(file, '{not json');
    const tracker = new AiUsageTracker(dir);
    expect(tracker.summary()).toEqual({ entries: 0, totalInput: 0, totalOutput: 0 });

    tracker.record(entry(5));
    const stored = JSON.parse(fs.readFileSync(file, 'utf-8')) as AiUsageEntry[];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(entry(5));
  });

  it('writes atomically (no .tmp file left behind after a record)', () => {
    const tracker = new AiUsageTracker(dir);
    tracker.record(entry(0));
    expect(fs.existsSync(path.join(dir, `${USAGE_FILE}.tmp`))).toBe(false);
  });
});
