// OkfCli.test.ts - The cockpit runs the repository's knowledge base checker, not its own copy of
// the rules (SPEC-0064, AC-8).
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { OkfCli } from '../../src/main/services/OkfCli';
import { REPO_ROOT, hostHas } from '../fixtures/workspace';

const VALID = path.join(REPO_ROOT, 'tools', 'okf-check', 'test', 'fixtures', 'valid');

// The repository's own checker and its fixtures; the configured-script test below needs neither.
const HAS_CHECKER = hostHas('tools/okf-check/okf-check.mjs') && hostHas('tools/okf-check/node_modules');

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

  it.skipIf(!HAS_CHECKER)('report runs the repository CLI on the given bundle (needs host okf-check next to the cockpit)', async () => {
    const dir = bundle();
    // The fixture's repo: sources live inside the bundle copy.
    const report = await new OkfCli(REPO_ROOT, process.execPath).report(dir, dir);
    expect(report.concepts).toBe(9);
    expect(report.errors).toEqual([]);
    expect(report.stats.documents).toBe(9);
    expect(report.stats.byType.Specification).toBe(3);
  });

  it.skipIf(!HAS_CHECKER)('a report with errors is a result, not a failure (needs host okf-check next to the cockpit)', async () => {
    const dir = bundle((d) => fs.rmSync(path.join(d, 'sub', 'index.md')));
    const report = await new OkfCli(REPO_ROOT, process.execPath).report(dir, dir);
    expect(report.errors.some((e) => e.file === 'sub/index.md' && e.rule === 'OKF-INDEX')).toBe(true);
  });

  it.skipIf(!HAS_CHECKER)('fixIndexes previews, then applies (needs host okf-check next to the cockpit)', async () => {
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

  it.skipIf(!HAS_CHECKER)('a workspace without the checker rejects with a readable message (needs host okf-check next to the cockpit)', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-noworkspace-'));
    dirs.push(empty);
    await expect(new OkfCli(empty, process.execPath).report(bundle())).rejects.toThrow(/checker was not found: .*tools[\\/]okf-check/);
  });

  it('runs the checker at the configured script path', async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-custom-'));
    dirs.push(ws);
    fs.mkdirSync(path.join(ws, 'qa'));
    fs.writeFileSync(
      path.join(ws, 'qa', 'kb-check.mjs'),
      'process.stdout.write(JSON.stringify({ errors: [], warnings: [], stats: { args: process.argv.slice(2) } }));\n',
    );
    const report = (await new OkfCli(ws, process.execPath, 'qa/kb-check.mjs').report('docs', ws)) as unknown as { stats: { args: string[] } };
    expect(report.stats.args).toEqual(['docs', '--repo', ws, '--json']);
    await expect(new OkfCli(ws, process.execPath, 'qa/missing.mjs').report('docs')).rejects.toThrow(/checker was not found: .*qa[\\/]missing\.mjs/);
  });
});
