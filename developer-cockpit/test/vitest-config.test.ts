import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * SPEC-0037: the suite's worker limit is half the CPUs, at least 2 and at most 6. Evaluates the
 * real vitest.config.ts with os.cpus() stubbed, so the result does not depend on this machine.
 */
async function configFor(cpuCount: number) {
  vi.resetModules();
  vi.doMock('os', async (importOriginal) => {
    const actual = await importOriginal<typeof import('os')>();
    const cpus = () => Array.from({ length: cpuCount }, () => actual.cpus()[0]);
    return { ...actual, cpus, default: { ...actual, cpus } };
  });
  const { default: config } = await import('../vitest.config');
  return config.test!;
}

describe('vitest.config.ts worker limit', () => {
  afterEach(() => {
    vi.doUnmock('os');
    vi.resetModules();
  });

  it('caps workers at half the CPUs, between 2 and 6', async () => {
    for (const [cpus, max] of [[1, 2], [4, 2], [8, 4], [12, 6], [32, 6]]) {
      const test = await configFor(cpus);
      expect(test.maxWorkers, `${cpus} CPUs`).toBe(max);
      expect(test.minWorkers, `${cpus} CPUs`).toBe(1);
    }
  });
});
