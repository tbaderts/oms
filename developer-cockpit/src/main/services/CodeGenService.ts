import { execFile } from 'child_process';
import * as path from 'path';
import type { CodeGenTask, CodeGenResult } from '../../shared/types/specs';

/** Runs a command and resolves with its exit code; a non-zero exit is a result, not an error. */
export type CommandRunner = (
  command: string,
  args: string[],
  opts: { cwd: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

// Matches CLAUDE.md "Code Generation": models come from oms-contracts, API interfaces from oms-core.
// The order is the "Run all" order: models first, interfaces are generated against them.
const TASKS: CodeGenTask[] = [
  {
    id: 'contracts',
    name: 'Contract models',
    description: 'Generate the shared command, query and Avro models in oms-contracts',
    inputSpec: 'openapi/*.yml, avro/*.avsc',
    outputPackage: 'org.example.common.model.{cmd,query,msg}',
    module: 'oms-contracts',
    gradleTasks: ['generateAvroJava', 'openApiGenerateCmdModels', 'openApiGenerateQueryModels'],
  },
  {
    id: 'api',
    name: 'API interfaces',
    description: 'Generate the ExecuteApi and SearchApi interfaces that oms-core implements',
    inputSpec: 'oms-cmd-api.yml, oms-query-api.yml',
    outputPackage: 'org.example.common.api',
    module: 'oms-core',
    gradleTasks: ['openApiGenerateCmd', 'openApiGenerateQuery'],
  },
];

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
  constructor(
    private workspaceRoot: string,
    private runner: CommandRunner = execFileRunner,
    private platform: NodeJS.Platform = process.platform,
  ) {}

  getTasks(): CodeGenTask[] {
    return TASKS;
  }

  async runTask(taskId: string): Promise<CodeGenResult> {
    const task = TASKS.find((t) => t.id === taskId);
    if (!task) {
      return { taskId, success: false, output: `Unknown task: ${taskId}`, durationMs: 0 };
    }

    // Each module is an independent build with its own wrapper. Node cannot execFile a .bat on
    // Windows, so it goes through cmd.exe; every argument is a constant from TASKS. The explicit
    // .\ is needed: with NoDefaultCurrentDirectoryInExePath set, cmd.exe ignores cwd for bare names.
    const cwd = path.join(this.workspaceRoot, task.module);
    const [command, args] = this.platform === 'win32'
      ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', '.\\gradlew.bat', ...task.gradleTasks]]
      : ['./gradlew', [...task.gradleTasks]];

    const start = Date.now();
    try {
      const r = await this.runner(command, args, { cwd });
      const durationMs = Date.now() - start;
      console.info('[codegen]', taskId, r.code, `${durationMs}ms`);
      const output = r.stdout + (r.stderr ? '\n' + r.stderr : '');
      return { taskId, success: r.code === 0, output, durationMs };
    } catch (e: unknown) {
      // Killed (timeout), output too large or not startable: keep whatever Gradle printed so far.
      const durationMs = Date.now() - start;
      const { stdout = '', stderr = '' } = e as { stdout?: string; stderr?: string };
      const message = e instanceof Error ? e.message : String(e);
      console.warn('[codegen]', taskId, 'failed', `${durationMs}ms`, message.split('\n')[0]);
      return { taskId, success: false, output: [message, stdout, stderr].filter(Boolean).join('\n'), durationMs };
    }
  }
}
