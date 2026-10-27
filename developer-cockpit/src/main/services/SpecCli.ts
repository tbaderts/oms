import { execFile } from 'child_process';
import * as path from 'path';

export interface SpecCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs `node specs/tools/spec.mjs` of a workspace. The CLI is the single implementation of the
 * spec workflow rules; the cockpit only calls it. Non-zero exit codes are results, not errors.
 */
export class SpecCli {
  constructor(
    private workspaceRoot: string,
    // In Electron, process.execPath is the Electron binary; ELECTRON_RUN_AS_NODE makes it act as Node.
    private nodePath: string = process.execPath,
  ) {}

  /** `input` is written to the CLI's stdin (e.g. for `gate --draft`); otherwise stdin is closed. */
  run(args: string[], input?: string): Promise<SpecCliResult> {
    const script = path.join(this.workspaceRoot, 'specs', 'tools', 'spec.mjs');
    const start = Date.now();

    return new Promise<SpecCliResult>((resolve, reject) => {
      const child = execFile(
        this.nodePath,
        [script, ...args],
        {
          cwd: this.workspaceRoot,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          timeout: 60_000,
          maxBuffer: 1024 * 1024 * 10,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const code = (error as NodeJS.ErrnoException & { code?: unknown } | null)?.code;
          if (error && typeof code !== 'number') {
            reject(new Error(`spec CLI failed: ${error.message}`));
            return;
          }
          const exitCode = typeof code === 'number' ? code : 0;
          console.info('[spec-cli]', args[0], args[1] ?? '', exitCode, `${Date.now() - start}ms`);
          resolve({ exitCode, stdout, stderr });
        },
      );
      // If the CLI exits before reading all input (EPIPE), its exit code and output still decide.
      child.stdin?.on('error', () => {});
      child.stdin?.end(input ?? '');
    });
  }

  /** Runs a read command with `--json` appended last (spec.mjs treats the token after a flag as its value). */
  async json<T>(args: string[], input?: string): Promise<T> {
    const r = await this.run([...args, '--json'], input);
    try {
      return JSON.parse(r.stdout) as T;
    } catch {
      throw new Error(`spec CLI returned no JSON for "${args.join(' ')}" (exit ${r.exitCode}): ${r.stderr || r.stdout}`);
    }
  }
}
