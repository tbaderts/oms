import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runConfig, type OrderSample, type RunConfig, type RunSummary, type SeriesPoint } from '../../shared/types.js';

export const FORMAT_VERSION = 1;

export interface StoredRun {
  formatVersion: 1;
  config: RunConfig;
  summary: RunSummary;
  series: SeriesPoint[];
  samples: OrderSample[];
}

export type RunListItem = { runId: string; readable: true; summary: RunSummary } | { runId: string; readable: false; reason: string };

const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Finished runs on local disk (design D8): `<dir>/<runId>/run.json` (config, summary, series) and
 * `samples.ndjson` (one OrderSample per line). Written to a temp file, then renamed.
 */
export class RunStore {
  constructor(private readonly dir: string) {}

  async save(run: StoredRun): Promise<void> {
    const runDir = join(this.dir, this.checkId(run.summary.runId));
    await mkdir(runDir, { recursive: true });
    const { samples, ...head } = run;
    await atomicWrite(join(runDir, 'samples.ndjson'), samples.map((s) => JSON.stringify(s)).join('\n') + (samples.length ? '\n' : ''));
    await atomicWrite(join(runDir, 'run.json'), JSON.stringify(head, null, 2));
  }

  async list(): Promise<RunListItem[]> {
    let names: string[];
    try {
      names = (await readdir(this.dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      return [];
    }
    const items = await Promise.all(names.map((n) => this.readHead(n)));
    const readable = items.filter((i): i is Extract<RunListItem, { readable: true }> => i.readable).sort((a, b) => b.summary.startedAt - a.summary.startedAt);
    return [...readable, ...items.filter((i) => !i.readable)];
  }

  async get(runId: string): Promise<StoredRun | null> {
    if (!RUN_ID.test(runId)) return null;
    const head = await this.readHead(runId);
    if (!head.readable) return null;
    try {
      const run = JSON.parse(await readFile(join(this.dir, runId, 'run.json'), 'utf8')) as Omit<StoredRun, 'samples'>;
      const text = await readFile(join(this.dir, runId, 'samples.ndjson'), 'utf8');
      const samples = text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as OrderSample);
      return { ...run, samples };
    } catch {
      return null;
    }
  }

  private async readHead(runId: string): Promise<RunListItem> {
    try {
      const head = JSON.parse(await readFile(join(this.dir, runId, 'run.json'), 'utf8'));
      if (head?.formatVersion !== FORMAT_VERSION) return { runId, readable: false, reason: `unknown format ${head?.formatVersion}` };
      if (!runConfig.safeParse(head.config).success || typeof head.summary?.runId !== 'string') return { runId, readable: false, reason: 'invalid run.json' };
      return { runId, readable: true, summary: head.summary as RunSummary };
    } catch (e) {
      return { runId, readable: false, reason: (e as Error).message };
    }
  }

  private checkId(runId: string): string {
    if (!RUN_ID.test(runId)) throw new Error(`invalid run id ${runId}`);
    return runId;
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await writeFile(path + '.tmp', content, 'utf8');
  await rename(path + '.tmp', path);
}
