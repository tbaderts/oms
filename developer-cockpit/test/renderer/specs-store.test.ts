// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpecsStore } from '../../src/renderer/stores/specs';
import { CodeGenService } from '../../src/main/services/CodeGenService';

describe('useSpecsStore code generation', () => {
  afterEach(() => useSpecsStore.setState(useSpecsStore.getInitialState(), true));

  it('run all runs contract models before API interfaces', async () => {
    // The real task table, as the main process serves it.
    const tasks = new CodeGenService('/ws', vi.fn()).getTasks();
    const runCodeGen = vi.fn(async (taskId: string) => ({ taskId, success: true, output: '', durationMs: 1 }));
    (window as unknown as { cockpit: unknown }).cockpit = { specs: { getCodeGenTasks: vi.fn(async () => tasks), runCodeGen } };

    await useSpecsStore.getState().loadCodeGenTasks();
    await useSpecsStore.getState().runAllCodeGen();

    expect(runCodeGen.mock.calls.map((c) => c[0])).toEqual(['contracts', 'api']);
  });

  it('run all stops when contract models fail', async () => {
    const tasks = new CodeGenService('/ws', vi.fn()).getTasks();
    const runCodeGen = vi.fn(async (taskId: string) => ({ taskId, success: false, output: 'FAILURE', durationMs: 1 }));
    (window as unknown as { cockpit: unknown }).cockpit = { specs: { getCodeGenTasks: vi.fn(async () => tasks), runCodeGen } };

    await useSpecsStore.getState().loadCodeGenTasks();
    await useSpecsStore.getState().runAllCodeGen();

    // The interfaces are generated against the models, so running them after a failure is wasted.
    expect(runCodeGen.mock.calls.map((c) => c[0])).toEqual(['contracts']);
  });
});
