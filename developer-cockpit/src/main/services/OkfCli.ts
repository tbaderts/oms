import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { KbHealthReport, KbIndexFixResult } from '../../shared/types/kb';

/**
 * Runs the repository's knowledge base checker (SPEC-0064): `knowledgeBase.checkScript` in
 * cockpit.yaml, by default `tools/okf-check/okf-check.mjs`.
 * Like SpecCli, the CLI is the single implementation of the rules; the cockpit only calls it and
 * shows the result. A non-zero exit code (errors found) is a result, not a failure.
 */
export const DEFAULT_CHECK_SCRIPT = 'tools/okf-check/okf-check.mjs';

export class OkfCli {
  constructor(
    private workspaceRoot: string,
    // In Electron, process.execPath is the Electron binary; ELECTRON_RUN_AS_NODE makes it act as Node.
    private nodePath: string = process.execPath,
    /** Workspace-relative path of the checker script. */
    private scriptPath: string = DEFAULT_CHECK_SCRIPT,
  ) {}

  private get script(): string {
    return path.resolve(this.workspaceRoot, this.scriptPath);
  }

  /** Errors, warnings and statistics of the bundle; `repo:` sources resolve against `repoRoot` (the workspace). */
  report(kbPath: string, repoRoot: string = this.workspaceRoot): Promise<KbHealthReport> {
    return this.json<KbHealthReport>([kbPath, '--repo', repoRoot, '--json']);
  }

  /** The links folder indexes miss: listed (`apply` false) or added to the index files. */
  fixIndexes(kbPath: string, apply: boolean): Promise<KbIndexFixResult> {
    return this.json<KbIndexFixResult>([kbPath, '--fix-indexes', '--json', ...(apply ? [] : ['--dry-run'])]);
  }

  private async json<T>(args: string[]): Promise<T> {
    if (!fs.existsSync(this.script)) {
      throw new Error(`The knowledge base checker was not found: ${this.script}. Check the workspace root in Settings.`);
    }
    const start = Date.now();
    const { exitCode, stdout, stderr } = await this.run(args);
    console.info('[okf-cli]', args.includes('--fix-indexes') ? 'fix-indexes' : 'report', exitCode, `${Date.now() - start}ms`);
    try {
      return JSON.parse(stdout) as T;
    } catch {
      throw new Error(
        `The knowledge base checker returned no report (exit ${exitCode}): ${(stderr || stdout).trim().slice(0, 500)}`
          + ` If its dependencies are missing, run npm install in ${path.dirname(this.scriptPath)}.`,
      );
    }
  }

  private run(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      execFile(
        this.nodePath,
        [this.script, ...args],
        {
          cwd: this.workspaceRoot,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          timeout: 120_000,
          maxBuffer: 1024 * 1024 * 20,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const code = (error as (NodeJS.ErrnoException & { code?: unknown }) | null)?.code;
          if (error && typeof code !== 'number') {
            reject(new Error(`The knowledge base checker failed to run: ${error.message}`));
            return;
          }
          resolve({ exitCode: typeof code === 'number' ? code : 0, stdout, stderr });
        },
      );
    });
  }
}
