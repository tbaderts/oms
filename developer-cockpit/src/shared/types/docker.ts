/**
 * Shared Docker types (SPEC-0043). The renderer calls `docker.list()` and `docker.logs()` over
 * IPC; the main process returns these shapes. The renderer never talks to the Docker daemon
 * directly.
 */

/** One row in the container table. */
export interface DockerContainer {
  /** The Docker container ID (12+ char hex). */
  id: string;
  /** The container name from `docker ps` (e.g. "oms-core"). */
  name: string;
  /** The image name:tag (e.g. "oms-core:latest"). */
  image: string;
  /** running | restarting | exited | dead | paused | created */
  status: string;
  /** healthy | unhealthy | starting | '' (no healthcheck defined) */
  health: string;
  /** Human-readable state string from `docker ps` (e.g. "Up 5 minutes"). */
  state: string;
  /** CPU percentage from `docker stats` (e.g. "0.42"). '' when the daemon is unreachable or the container is stopped. */
  cpu: string;
  /** Memory usage from `docker stats` (e.g. "128MiB / 8GiB"). '' when unreachable or stopped. */
  memory: string;
  /** Published ports, e.g. "0.0.0.0:8090->8090/tcp". '' when none. */
  ports: string;
}

/** The result of `docker:list`. `ok: false` with `code` and `message` when the daemon is unreachable. */
export interface DockerStats {
  ok: boolean;
  code?: string;
  message?: string;
  containers?: DockerContainer[];
}

/** The result of `docker:logs`. `ok: false` when the container is not found or the daemon is unreachable. */
export interface DockerLogs {
  ok: boolean;
  code?: string;
  message?: string;
  /** The log text (stdout + stderr combined). Present only when `ok` is true. */
  logs?: string;
}
