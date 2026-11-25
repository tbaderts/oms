import { execFile } from 'child_process';
import * as path from 'path';
import type { CodeGenTask, CodeGenResult } from '../../shared/types/specs';

/** Runs a command and resolves with its exit code; a non-zero exit is a result, not an error. */
export type CommandRunner = (
  command: string,
  args: string[],
  opts: { cwd: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

const execFileRunner: CommandRunner = (command, args, opts) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { ...opts, timeout: 10 * 60_000, maxBuffer: 1024 * 1024 * 10, windowsHide: true },
      (error, stdout, stderr) => {
        const code = (error as (NodeJS.ErrnoException & { code?: unknown }) | null)?.code;
        if (error && typeof code !== 'number') {
          reject(Object.assign(error, { stdout: stdout ?? '', stderr: stderr ?? '' }));
          return;
        }
        resolve({ code: typeof code === 'number' ? code : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
      });
  });

export class CodeGenService {
  /** `tasks` come from the project's `cockpit.yaml` (`codegen`), in their "Run all" order. */
  constructor(
    private workspaceRoot: string,
    private tasks: CodeGenTask[] = [],
    private runner: CommandRunner = execFileRunner,
    private platform: NodeJS.Platform = process.platform,
  ) {}

  getTasks(): CodeGenTask[] {
    return this.tasks;
  }

  async runTask(taskId: string): Promise<CodeGenResult> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) {
      return { taskId, success: false, output: `Unknown task: ${taskId}`, durationMs: 0 };
    }

    // The folder must stay inside the workspace; the command comes from the project's own file.
    const workspace = path.resolve(this.workspaceRoot);
    const cwd = path.resolve(workspace, task.cwd || '.');
    if (cwd !== workspace && !cwd.startsWith(workspace + path.sep)) {
      return { taskId, success: false, output: `The task folder ${task.cwd} is outside the workspace`, durationMs: 0 };
    }
    // Node cannot execFile a .bat or .cmd on Windows, so those go through cmd.exe. Write them with an
    // explicit .\\ (e.g. ".\\gradlew.bat"): with NoDefaultCurrentDirectoryInExePath set, cmd.exe
    // ignores cwd for bare names.
    const argv = this.platform === 'win32' && task.windowsCommand?.length ? task.windowsCommand : task.command;
    const [command, args] = this.platform === 'win32' && /\.(bat|cmd)$/i.test(argv[0])
      ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ...argv]]
      : [argv[0], argv.slice(1)];

    const start = Date.now();
    try {
      const r = await this.runner(command, args, { cwd });
      const durationMs = Date.now() - start;
      console.info('[codegen]', taskId, r.code, `${durationMs}ms`);
      const output = r.stdout + (r.stderr ? '\n' + r.stderr : '');
      return { taskId, success: r.code === 0, output, durationMs };
    } catch (e: unknown) {
      // Killed (timeout), output too large or not startable: keep whatever the command printed so far.
      const durationMs = Date.now() - start;
      const { stdout = '', stderr = '' } = e as { stdout?: string; stderr?: string };
      const message = e instanceof Error ? e.message : String(e);
      console.warn('[codegen]', taskId, 'failed', `${durationMs}ms`, message.split('\n')[0]);
      return { taskId, success: false, output: [message, stdout, stderr].filter(Boolean).join('\n'), durationMs };
    }
  }
}
