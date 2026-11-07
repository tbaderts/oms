import * as cp from 'child_process';
import type { IpcMain } from 'electron';
import type { ConfigService } from '../services/ConfigService';
import { DockerService } from '../services/DockerService';
import type { DockerLogs, DockerStats } from '../../shared/types/docker';

/**
 * Injectable dependencies for the Docker IPC (SPEC-0043). `execFile` is injected so tests
 * can mock the `docker` CLI; production passes `child_process.execFile`.
 */
export interface DockerIpcDeps {
  configService: ConfigService;
  /** The `docker` CLI path. Defaults to `docker` (found on PATH). */
  dockerPath?: string;
  /** Test seam: a fake execFile. Production omits this (uses `child_process.execFile`). */
  execFile?: unknown;
}

/**
 * IPC for Docker container monitoring (SPEC-0043).
 *
 * Two channels:
 * - `docker:list` — returns all containers with status, health, CPU, and memory.
 * - `docker:logs` — returns the last N lines of a container's logs.
 *
 * Both channels always resolve (never reject): a missing CLI or unreachable daemon returns
 * `{ ok: false, code, message }`, mirroring the `ai.ipc.ts` pattern.
 */
export function registerDockerIpc(ipcMain: IpcMain, deps: DockerIpcDeps): void {
  const dockerPath = deps.dockerPath ?? 'docker';
  const service = new DockerService((deps.execFile ?? cp.execFile) as never, dockerPath);

  ipcMain.handle('docker:list', async (): Promise<DockerStats> => {
    if (!deps.configService.getConfig().infrastructure.dockerEnabled) {
      return { ok: false, code: 'disabled', message: 'Docker monitoring is disabled in Settings.' };
    }
    return service.listContainers();
  });

  ipcMain.handle('docker:logs', async (_event, container: unknown, lines?: unknown): Promise<DockerLogs> => {
    if (typeof container !== 'string' || !container.trim()) {
      return { ok: false, code: 'invalid', message: 'Container name must be a non-empty string.' };
    }
    const lineCount = typeof lines === 'number' ? lines : 200;
    return service.getLogs(container.trim(), lineCount);
  });
}
