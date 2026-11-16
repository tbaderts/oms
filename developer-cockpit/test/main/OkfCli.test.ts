// OkfCli.test.ts - The cockpit runs the repository's knowledge base checker, not its own copy of
// the rules (SPEC-0064, AC-8).
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { OkfCli } from '../../src/main/services/OkfCli';
import { REPO_ROOT } from '../fixtures/workspace';

const VALID = path.join(REPO_ROOT, 'tools', 'okf-check', 'test', 'fixtures', 'valid');

describe('OkfCli', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  /** A copy of the checker's valid fixture bundle; `edit` changes it before the run. */
  function bundle(edit?: (dir: string) => void): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-cli-'));
    dirs.push(dir);
    fs.cpSync(VALID, dir, { recursive: true });
    edit?.(dir);
    return dir;
  }

  it('report runs the repository CLI on the given bundle', async () => {
    const dir = bundle();
    // The fixture's repo: sources live inside the bundle copy.
    const report = await new OkfCli(REPO_ROOT, process.execPath).report(dir, dir);
    expect(report.concepts).toBe(9);
    expect(report.errors).toEqual([]);
    expect(report.stats.documents).toBe(9);
    expect(report.stats.byType.Specification).toBe(3);
  });

  it('a report with errors is a result, not a failure', async () => {
    const dir = bundle((d) => fs.rmSync(path.join(d, 'sub', 'index.md')));
    const report = await new OkfCli(REPO_ROOT, process.execPath).report(dir, dir);
    expect(report.errors.some((e) => e.file === 'sub/index.md' && e.rule === 'OKF-INDEX')).toBe(true);
  });

  it('fixIndexes previews, then applies', async () => {
    const dir = bundle((d) => fs.writeFileSync(path.join(d, 'sub', 'index.md'), '# Sub\n'));
    const cli = new OkfCli(REPO_ROOT, process.execPath);

    const preview = await cli.fixIndexes(dir, false);
    expect(preview.applied).toBe(false);
    expect(preview.changes).toEqual([
      { index: 'sub/index.md', created: false, documents: ['- [Concept B](concept-b.md) — A nested concept.'], sections: [] },
    ]);
    expect(fs.readFileSync(path.join(dir, 'sub', 'index.md'), 'utf8')).toBe('# Sub\n');

    const applied = await cli.fixIndexes(dir, true);
    expect(applied.applied).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'sub', 'index.md'), 'utf8')).toContain('- [Concept B](concept-b.md)');
    expect((await cli.report(dir, dir)).errors).toEqual([]);
  });

  it('a workspace without the checker rejects with a readable message', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-noworkspace-'));
    dirs.push(empty);
    await expect(new OkfCli(empty, process.execPath).report(bundle())).rejects.toThrow(/checker was not found: .*tools[\\/]okf-check/);
  });
});
