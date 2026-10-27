import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import { CodeGenService, type CommandRunner } from '../../src/main/services/CodeGenService';

const ROOT = path.resolve('/ws/oms');

/** A runner that records the call and exits with `code`. */
function fakeRunner(code = 0, stdout = 'BUILD SUCCESSFUL', stderr = '') {
  return vi.fn<CommandRunner>(async () => ({ code, stdout, stderr }));
}

describe('CodeGenService', () => {
  it('lists contract models then API interfaces', () => {
    const tasks = new CodeGenService(ROOT, fakeRunner()).getTasks();
    expect(tasks.map((t) => [t.id, t.name, t.module, t.gradleTasks])).toEqual([
      ['contracts', 'Contract models', 'oms-contracts', ['generateAvroJava', 'openApiGenerateCmdModels', 'openApiGenerateQueryModels']],
      ['api', 'API interfaces', 'oms-core', ['openApiGenerateCmd', 'openApiGenerateQuery']],
    ]);
  });

  it('runs each task with its module wrapper (posix)', async () => {
    const runner = fakeRunner();
    const svc = new CodeGenService(ROOT, runner, 'linux');

    const r1 = await svc.runTask('contracts');
    const r2 = await svc.runTask('api');

    expect(runner.mock.calls).toEqual([
      ['./gradlew', ['generateAvroJava', 'openApiGenerateCmdModels', 'openApiGenerateQueryModels'], { cwd: path.join(ROOT, 'oms-contracts') }],
      ['./gradlew', ['openApiGenerateCmd', 'openApiGenerateQuery'], { cwd: path.join(ROOT, 'oms-core') }],
    ]);
    expect(r1).toMatchObject({ taskId: 'contracts', success: true, output: expect.stringContaining('BUILD SUCCESSFUL') });
    expect(r2.success).toBe(true);
  });

  it('uses cmd.exe for gradlew.bat on Windows', async () => {
    const runner = fakeRunner();
    await new CodeGenService(ROOT, runner, 'win32').runTask('api');

    const [cmd, args, opts] = runner.mock.calls[0];
    expect(cmd.toLowerCase()).toMatch(/cmd\.exe$/);
    // Explicit relative path: with NoDefaultCurrentDirectoryInExePath set, cmd.exe ignores cwd for bare names.
    expect(args).toEqual(['/d', '/s', '/c', '.\\gradlew.bat', 'openApiGenerateCmd', 'openApiGenerateQuery']);
    expect(opts).toEqual({ cwd: path.join(ROOT, 'oms-core') });
  });

  it('reports failures with output', async () => {
    const runner = fakeRunner(1, 'FAILURE: Build failed', "Task 'x' not found");
    const r = await new CodeGenService(ROOT, runner, 'linux').runTask('contracts');
    expect(r.success).toBe(false);
    expect(r.output).toContain('FAILURE: Build failed');
    expect(r.output).toContain("Task 'x' not found");
  });

  it('keeps the output collected before a killed or failed process', async () => {
    const runner = vi.fn<CommandRunner>(async () => {
      throw Object.assign(new Error('Command failed: timed out'), { stdout: '> Task :openApiGenerateCmd', stderr: 'killed' });
    });
    const r = await new CodeGenService(ROOT, runner, 'linux').runTask('api');
    expect(r.success).toBe(false);
    expect(r.output).toContain('timed out');
    expect(r.output).toContain('> Task :openApiGenerateCmd');
    expect(r.output).toContain('killed');
  });

  it('rejects unknown task ids without starting a process', async () => {
    const runner = fakeRunner();
    const svc = new CodeGenService(ROOT, runner, 'win32');
    for (const id of ['avro', 'cmd', 'contracts & calc', '']) {
      const r = await svc.runTask(id);
      expect(r).toMatchObject({ taskId: id, success: false, output: `Unknown task: ${id}` });
    }
    expect(runner).not.toHaveBeenCalled();
  });
});
