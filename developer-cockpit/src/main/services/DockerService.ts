import * as cp from 'child_process';
import type { DockerContainer, DockerLogs, DockerStats } from '../../shared/types/docker';

/** The `docker` CLI command timeout in milliseconds. */
const CMD_TIMEOUT_MS = 10_000;

/**
 * Parses JSONL (one JSON object per line) output from `docker ps --format json` or
 * `docker stats --no-stream --format json`. Returns an empty array for empty input.
 */
function parseJsonl(text: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    items.push(JSON.parse(trimmed) as Record<string, string>);
  }
  return items;
}

/** A minimal interface for the `execFile` function so tests can inject a fake. */
type ExecFile = (
  cmd: string,
  args: string[],
  opts: Record<string, unknown>,
  cb: (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => void,
) => unknown;

/**
 * Queries the local Docker daemon via the `docker` CLI (SPEC-0043).
 *
 * The service is read-only: it never starts, stops, or modifies containers. All methods return
 * typed result objects (`DockerStats`, `DockerLogs`) rather than throwing, so the IPC layer and
 * the renderer can surface errors gracefully (AC-3, AC-7, AC-8).
 *
 * The `execFile` function is injected for testability: production passes `cp.execFile`,
 * tests pass a mock.
 */
export class DockerService {
  constructor(
    private execFile: ExecFile,
    private dockerPath: string = 'docker',
  ) {}

  /**
   * Lists all containers (running and stopped) with status, health, CPU, and memory (AC-1, AC-2).
   *
   * Two CLI calls:
   * 1. `docker ps -a --format json` — name, image, state, status, health, ports.
   * 2. `docker stats --no-stream --format json` — CPU and memory (running containers only).
   *
   * The results are merged by container ID. A stopped container has no stats entry, so its
   * CPU/memory fields are empty strings (AC-1).
   *
   * Returns `{ ok: false, code: 'unavailable' }` when the CLI is missing or the daemon is
   * unreachable (AC-3, AC-7).
   */
  async listContainers(): Promise<DockerStats> {
    // Step 1: container list
    const psResult = await this.runCli(['ps', '-a', '--format', 'json']);
    if (!psResult.ok) return psResult;

    // `docker ps --format json` outputs JSONL (one JSON object per line), not a JSON array.
    let psItems: Record<string, string>[];
    try {
      psItems = parseJsonl(psResult.stdout);
      if (psItems.length === 0 && psResult.stdout.trim()) {
        // Non-empty output that produced no items: likely a format change or empty daemon.
        return { ok: false, code: 'parse_error', message: 'Could not parse docker ps output.' };
      }
    } catch {
      return { ok: false, code: 'parse_error', message: 'Could not parse docker ps output.' };
    }

    // Step 2: CPU/memory stats (non-fatal: a stats failure degrades to empty CPU/memory)
    const statsResult = await this.runCli(['stats', '--no-stream', '--format', 'json']);
    let statsByContainer = new Map<string, { cpu: string; memory: string }>();
    if (statsResult.ok) {
      try {
        for (const s of parseJsonl(statsResult.stdout)) {
          statsByContainer.set(s.ID ?? s.Container ?? s.Name, {
            cpu: s.CPUPerc ?? '',
            memory: s.MemUsage ?? '',
          });
        }
      } catch {
        // Stats parse failure is non-fatal: the container list is still valid.
      }
    }

    const containers: DockerContainer[] = psItems.map((item) => {
      const stats = statsByContainer.get(item.ID) ?? { cpu: '', memory: '' };
      return {
        id: item.ID ?? '',
        name: item.Names ?? '',
        image: item.Image ?? '',
        status: item.State ?? '',
        health: item.HealthStatus ?? '',
        state: item.Status ?? '',
        cpu: stats.cpu,
        memory: stats.memory,
        ports: item.Ports ?? '',
      };
    });

    return { ok: true, containers };
  }

  /**
   * Returns the last `lines` of a container's combined stdout/stderr logs (AC-5).
   *
   * Returns `{ ok: false, code: 'unavailable' }` when the CLI is missing,
   * `{ ok: false, code: 'not_found' }` when the container does not exist.
   */
  async getLogs(container: string, lines: number = 200): Promise<DockerLogs> {
    const clamped = Math.min(Math.max(lines, 1), 1000);
    const result = await this.runCli(['logs', '--tail', String(clamped), container]);
    if (!result.ok) return result;
    return { ok: true, logs: result.stdout };
  }

  /**
   * Runs a `docker` CLI command and captures stdout/stderr.
   * Returns `{ ok: true, stdout, stderr }` on success,
   * `{ ok: false, code, message }` on failure.
   */
  private runCli(args: string[]): Promise<{ ok: true; stdout: string; stderr: string } | { ok: false; code: string; message: string }> {
    return new Promise((resolve) => {
      this.execFile(this.dockerPath, args, { timeout: CMD_TIMEOUT_MS }, (err, stdout, stderr) => {
        if (err) {
          const code = 'unavailable';
          const message =
            err.code === 'ENOENT'
              ? 'Docker CLI not found or daemon not reachable.'
              : `Docker daemon not reachable: ${err.message}`;
          console.warn(`[docker] ${args[0]} failed: ${err.message}`);
          resolve({ ok: false, code, message });
          return;
        }
        resolve({ ok: true, stdout, stderr });
      });
    });
  }
}
