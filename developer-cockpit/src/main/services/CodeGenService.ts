import { execFile } from 'child_process';
import * as path from 'path';
import type { CodeGenTask, CodeGenResult } from '../../shared/types/specs';

const TASKS: CodeGenTask[] = [
  {
    id: 'cmd',
    name: 'Command API',
    description: 'Generate Command API models',
    inputSpec: 'oms-cmd-api.yml',
    outputPackage: 'org.example.common.model.cmd',
  },
  {
    id: 'query',
    name: 'Query API',
    description: 'Generate Query API models',
    inputSpec: 'oms-query-api.yml',
    outputPackage: 'org.example.common.model.query',
  },
  {
    id: 'avro',
    name: 'Avro Schemas',
    description: 'Generate Avro schemas from OpenAPI',
    inputSpec: 'oms-cmd-api.yml',
    outputPackage: 'org.example.common.model.msg',
  },
];

const TASK_GRADLE_MAP: Record<string, string> = {
  cmd: 'openApiGenerateCmd',
  query: 'openApiGenerateQuery',
  avro: 'openApiGenerateAvro',
};

export class CodeGenService {
  constructor(private workspaceRoot: string) {}

  getTasks(): CodeGenTask[] {
    return TASKS;
  }

  async runTask(taskId: string): Promise<CodeGenResult> {
    const gradleTask = TASK_GRADLE_MAP[taskId];
    if (!gradleTask) {
      return { taskId, success: false, output: `Unknown task: ${taskId}`, durationMs: 0 };
    }

    const isWindows = process.platform === 'win32';
    const executable = isWindows ? 'gradlew.bat' : './gradlew';
    const cwd = this.workspaceRoot;
    const args = ['-p', 'oms-core', gradleTask];

    const start = Date.now();

    return new Promise<CodeGenResult>((resolve) => {
      execFile(
        executable,
        args,
        { cwd, timeout: 120_000, maxBuffer: 1024 * 1024 * 5 },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - start;
          const output = (stdout || '') + (stderr ? '\n' + stderr : '');
          if (error) {
            resolve({ taskId, success: false, output: output || error.message, durationMs });
          } else {
            resolve({ taskId, success: true, output, durationMs });
          }
        },
      );
    });
  }
}
