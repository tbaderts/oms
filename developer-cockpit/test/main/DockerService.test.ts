import { describe, expect, it, vi } from 'vitest';
import { DockerService } from '../../src/main/services/DockerService';
import type { DockerContainer } from '../../src/shared/types/docker';

/**
 * A fake `execFile` that returns canned Docker CLI output.
 * `psOutput` is the JSON array from `docker ps -a --format json`.
 * `statsOutput` is the JSON array from `docker stats --no-stream --format json`.
 */
function makeExecFile(opts: {
  psOutput?: unknown;
  statsOutput?: unknown;
  logsOutput?: string;
  psError?: NodeJS.ErrnoException;
  statsError?: NodeJS.ErrnoException;
  logsError?: NodeJS.ErrnoException;
}) {
  const calls: { cmd: string; args: string[] }[] = [];
  const execFile = vi.fn((_cmd: string, args: string[], _opts: unknown, cb: (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void) => {
    calls.push({ cmd: _cmd, args });
    if (args[0] === 'ps') {
      if (opts.psError) return cb(opts.psError, '', '');
      // docker ps --format json outputs JSONL (one object per line), not a JSON array.
      const items = opts.psOutput ?? [];
      return cb(null, (Array.isArray(items) ? items : [items]).map((o) => JSON.stringify(o)).join('\n'), '');
    }
    if (args[0] === 'stats') {
      if (opts.statsError) return cb(opts.statsError, '', '');
      const items = opts.statsOutput ?? [];
      return cb(null, (Array.isArray(items) ? items : [items]).map((o) => JSON.stringify(o)).join('\n'), '');
    }
    if (args[0] === 'logs') {
      if (opts.logsError) return cb(opts.logsError, '', '');
      return cb(null, opts.logsOutput ?? '', '');
    }
    cb(null, '', '');
  });
  return { execFile, calls };
}

const PS_OUTPUT = [
  { ID: 'abc123', Names: 'oms-core', Image: 'oms-core:latest', State: 'running', Status: 'Up 5 minutes', HealthStatus: 'healthy', Ports: '0.0.0.0:8090->8090/tcp' },
  { ID: 'def456', Names: 'broker', Image: 'confluentinc/cp-kafka:7.9.9', State: 'running', Status: 'Up 2 hours', HealthStatus: '', Ports: '0.0.0.0:9092->9092/tcp' },
  { ID: 'ghi789', Names: 'exchange-simulator', Image: 'oms-exchange-simulator:latest', State: 'restarting', Status: 'Restarting (1) 10 seconds ago', HealthStatus: '', Ports: '' },
  { ID: 'jkl012', Names: 'old-container', Image: 'test:1.0', State: 'exited', Status: 'Exited (1) 2 hours ago', HealthStatus: '', Ports: '' },
  { ID: 'mno345', Names: 'broken-container', Image: 'broken:0.1', State: 'dead', Status: 'Dead', HealthStatus: '', Ports: '' },
];

const STATS_OUTPUT = [
  { ID: 'abc123', Container: 'abc123fullhash', Name: 'oms-core', CPUPerc: '0.42%', MemUsage: '128MiB / 8GiB' },
  { ID: 'def456', Container: 'def456fullhash', Name: 'broker', CPUPerc: '1.20%', MemUsage: '512MiB / 8GiB' },
  { ID: 'ghi789', Container: 'ghi789fullhash', Name: 'exchange-simulator', CPUPerc: '0.00%', MemUsage: '64MiB / 8GiB' },
];

describe('DockerService', () => {
  it('AC-1: listContainers returns all containers with merged stats', async () => {
    const { execFile } = makeExecFile({ psOutput: PS_OUTPUT, statsOutput: STATS_OUTPUT });
    const svc = new DockerService(execFile as never);
    const result = await svc.listContainers();
    expect(result.ok).toBe(true);
    expect(result.containers).toHaveLength(5);
    const omsCore = result.containers!.find((c) => c.name === 'oms-core');
    expect(omsCore?.status).toBe('running');
    expect(omsCore?.cpu).toBe('0.42%');
    expect(omsCore?.memory).toBe('128MiB / 8GiB');
    expect(omsCore?.health).toBe('healthy');
    expect(omsCore?.ports).toBe('0.0.0.0:8090->8090/tcp');
    // A stopped container has no stats entry: CPU/memory are empty strings.
    const old = result.containers!.find((c) => c.name === 'old-container');
    expect(old?.cpu).toBe('');
    expect(old?.memory).toBe('');
  });

  it('AC-2: listContainers preserves status values for color mapping', async () => {
    const { execFile } = makeExecFile({ psOutput: PS_OUTPUT, statsOutput: [] });
    const svc = new DockerService(execFile as never);
    const result = await svc.listContainers();
    const statuses = new Map(result.containers!.map((c) => [c.name, c.status]));
    expect(statuses.get('oms-core')).toBe('running');
    expect(statuses.get('exchange-simulator')).toBe('restarting');
    expect(statuses.get('old-container')).toBe('exited');
    expect(statuses.get('broken-container')).toBe('dead');
  });

  it('AC-3: listContainers returns unavailable when the CLI is missing (ENOENT)', async () => {
    const err = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' });
    const { execFile } = makeExecFile({ psError: err as never });
    const svc = new DockerService(execFile as never);
    const result = await svc.listContainers();
    expect(result.ok).toBe(false);
    expect(result.code).toBe('unavailable');
    expect(result.message).toMatch(/not found|not reachable/i);
  });

  it('AC-5: getLogs returns the tail of a container\'s logs', async () => {
    const logContent = 'line1\nline2\nline3';
    const { execFile, calls } = makeExecFile({ logsOutput: logContent });
    const svc = new DockerService(execFile as never);
    const result = await svc.getLogs('oms-core', 200);
    expect(result.ok).toBe(true);
    expect(result.logs).toBe(logContent);
    // Verify the correct args were passed.
    const logsCall = calls.find((c) => c.args[0] === 'logs');
    expect(logsCall?.args).toEqual(['logs', '--tail', '200', 'oms-core']);
  });

  it('AC-5: getLogs uses default 200 lines when no line count is given', async () => {
    const { execFile, calls } = makeExecFile({ logsOutput: 'ok' });
    const svc = new DockerService(execFile as never);
    await svc.getLogs('broker');
    const logsCall = calls.find((c) => c.args[0] === 'logs');
    expect(logsCall?.args).toEqual(['logs', '--tail', '200', 'broker']);
  });

  it('AC-7: listContainers returns unavailable when docker ps fails with non-ENOENT error', async () => {
    const err = Object.assign(new Error('Cannot connect to the Docker daemon'), { code: 'ECONNREFUSED' });
    const { execFile } = makeExecFile({ psError: err as never });
    const svc = new DockerService(execFile as never);
    const result = await svc.listContainers();
    expect(result.ok).toBe(false);
    expect(result.code).toBe('unavailable');
    expect(result.message).toMatch(/daemon|unreachable/i);
  });

  it('getLogs returns unavailable when the CLI is missing', async () => {
    const err = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' });
    const { execFile } = makeExecFile({ logsError: err as never });
    const svc = new DockerService(execFile as never);
    const result = await svc.getLogs('oms-core');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('unavailable');
  });
});
