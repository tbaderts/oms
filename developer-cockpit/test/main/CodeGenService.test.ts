import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import { CodeGenService, type CommandRunner } from '../../src/main/services/CodeGenService';
import { parseProjectConfig } from '../../src/shared/projectConfig';
import type { CodeGenTask } from '../../src/shared/types/specs';

const ROOT = path.resolve('/ws/acme');

/** The tasks a fixture project lists in its cockpit.yaml. */
const TASKS: CodeGenTask[] = parseProjectConfig(
  `
codegen:
  - id: models
    name: Models
    description: Generate the models
    cwd: contracts
    command: ["./gradlew", "generateModels"]
    windowsCommand: [".\\\\gradlew.bat", "generateModels"]
    inputs: openapi/*.yml
  - id: client
    name: Client
    cwd: web
    command: ["npm", "run", "generate"]
`,
  '/ws/acme/cockpit.yaml',
).config.codegen;

/** A runner that records the call and exits with `code`. */
function fakeRunner(code = 0, stdout = 'BUILD SUCCESSFUL', stderr = '') {
  return vi.fn<CommandRunner>(async () => ({ code, stdout, stderr }));
}

describe('CodeGenService', () => {
  it('tasksComeFromProjectConfig', () => {
    expect(TASKS).toHaveLength(2);
    const tasks = new CodeGenService(ROOT, TASKS, fakeRunner()).getTasks();
    expect(tasks.map((t) => [t.id, t.name, t.cwd, t.command])).toEqual([
      ['models', 'Models', 'contracts', ['./gradlew', 'generateModels']],
      ['client', 'Client', 'web', ['npm', 'run', 'generate']],
    ]);
    expect(new CodeGenService(ROOT).getTasks()).toEqual([]);
  });

  it('runs each task with its command in its folder (posix)', async () => {
    const runner = fakeRunner();
    const svc = new CodeGenService(ROOT, TASKS, runner, 'linux');

    const r1 = await svc.runTask('models');
    const r2 = await svc.runTask('client');

    expect(runner.mock.calls).toEqual([
      ['./gradlew', ['generateModels'], { cwd: path.join(ROOT, 'contracts') }],
      ['npm', ['run', 'generate'], { cwd: path.join(ROOT, 'web') }],
    ]);
    expect(r1).toMatchObject({ taskId: 'models', success: true, output: expect.stringContaining('BUILD SUCCESSFUL') });
    expect(r2.success).toBe(true);
  });

  it('uses the Windows command, through cmd.exe for a .bat', async () => {
    const runner = fakeRunner();
    await new CodeGenService(ROOT, TASKS, runner, 'win32').runTask('models');

    const [cmd, args, opts] = runner.mock.calls[0];
    expect(cmd.toLowerCase()).toMatch(/cmd\.exe$/);
    expect(args).toEqual(['/d', '/s', '/c', '.\\gradlew.bat', 'generateModels']);
    expect(opts).toEqual({ cwd: path.join(ROOT, 'contracts') });
  });

  it('a task folder outside the workspace is refused without starting a process', async () => {
    const runner = fakeRunner();
    const r = await new CodeGenService(ROOT, [{ ...TASKS[0], cwd: '../elsewhere' }], runner, 'linux').runTask('models');
    expect(r.success).toBe(false);
    expect(r.output).toMatch(/outside the workspace/);
    expect(runner).not.toHaveBeenCalled();
  });

  it('reports failures with output', async () => {
    const runner = fakeRunner(1, 'FAILURE: Build failed', "Task 'x' not found");
    const r = await new CodeGenService(ROOT, TASKS, runner, 'linux').runTask('models');
    expect(r.success).toBe(false);
    expect(r.output).toContain('FAILURE: Build failed');
    expect(r.output).toContain("Task 'x' not found");
  });

  it('keeps the output collected before a killed or failed process', async () => {
    const runner = vi.fn<CommandRunner>(async () => {
      throw Object.assign(new Error('Command failed: timed out'), { stdout: '> Task :generateModels', stderr: 'killed' });
    });
    const r = await new CodeGenService(ROOT, TASKS, runner, 'linux').runTask('models');
    expect(r.success).toBe(false);
    expect(r.output).toContain('timed out');
    expect(r.output).toContain('> Task :generateModels');
    expect(r.output).toContain('killed');
  });

  it('rejects unknown task ids without starting a process', async () => {
    const runner = fakeRunner();
    const svc = new CodeGenService(ROOT, TASKS, runner, 'win32');
    for (const id of ['avro', 'cmd', 'models & calc', '']) {
      const r = await svc.runTask(id);
      expect(r).toMatchObject({ taskId: id, success: false, output: `Unknown task: ${id}` });
    }
    expect(runner).not.toHaveBeenCalled();
  });
});
