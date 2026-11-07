# Proposal — SPEC-0043: Docker monitoring for developer-cockpit

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The developer-cockpit has a "Docker" navigation entry under Infrastructure, but it renders only a
"planned for a future phase" placeholder. Meanwhile, the `docker-compose.yml` at the repo root defines
14+ containers (oms-core, streaming-service, exchange-simulator, broker, postgres, grafana, loki, tempo,
mimir, alloy, qdrant, pgadmin, control-center, grafana-mcp) and the user must resort to a separate terminal
(`docker ps`, `docker logs`) to check whether a container is up, crashed, restarting, or running out of
resources.

The cost of doing nothing: a developer working on the OMS stack cannot see at a glance which containers
are healthy, which are restarting in a loop, or which are consuming abnormal CPU/memory — forcing context
switches to a terminal and, worse, letting a crashed container go unnoticed until a test or request fails.
The cockpit already has the scaffolding (a nav entry, a placeholder view, a `dockerEnabled` config toggle)
but no actual Docker integration. This ticket fills that gap.

## What Changes

- **New**: The cockpit's **Docker** view (previously a placeholder) becomes a live container dashboard that
  lists all running and stopped containers from the local Docker daemon, with name, image, status, health,
  CPU, and memory columns.
- **New**: A main-process IPC channel `docker:list` that queries the Docker daemon (via `docker` CLI or the
  Docker socket) and returns a typed array of container summaries.
- **New**: A main-process service (`DockerService`) that shells out to `docker ps --format json` (or the
  equivalent) and parses the result, so the renderer never talks to the daemon directly.
- **New**: The renderer view auto-refreshes the container list on a configurable interval (default 5 s),
  so status changes (a container starting, stopping, or entering a restart loop) are visible without
  manual reload.
- **New**: A `docker:logs` IPC channel that returns the last N lines of a container's logs, so the user can
  inspect a failing container without leaving the cockpit.
- **Modified**: `ContentArea.tsx` — the `docker` entry in `VIEW_MAP` is swapped from the lazy
  `PlaceholderView` to the new `DockerView`.
- **Modified**: `preload.ts` and the shared `CockpitAPI` type — a `docker` namespace is added exposing
  `list()` and `logs(container, lines)`.
- **Modified**: `SettingsView.tsx` — a "Docker" section is added to the Infrastructure tab with a
  refresh-interval control and a Docker socket/CLI path override (for non-default Docker installations).

No **BREAKING** changes: the `dockerEnabled` config field already exists and is respected (when `false`,
the Docker view shows a "Docker is disabled" notice instead of container data).

## Scope

### In scope

- Read-only container listing (name, image, status, health, CPU %, memory) from the local Docker daemon.
- Per-container log retrieval (last N lines, default 200) for any listed container.
- Auto-refresh of the container list on a configurable interval.
- Graceful handling of Docker not installed / not running / socket unreachable (show a clear error banner,
  not a crash).
- Respecting the existing `infrastructure.dockerEnabled` config flag.
- Type-safe IPC contracts (shared types, zod-validated at the boundary).
- Unit tests for the Docker service (mocking the `docker` CLI) and the renderer view (mocking the IPC).

### Out of scope

- Container lifecycle control (start / stop / restart / kill / remove). These are write operations on the
  daemon; a separate ticket should add them with explicit confirmation UX.
- Real-time streaming logs (WebSocket tail). The initial delivery uses on-demand log fetch; streaming can be
  a follow-up.
- Kubernetes / Docker Swarm / multi-host Docker. This is strictly the local Docker daemon on the machine
  where the cockpit runs.
- Grafana / Prometheus metric integration. The "Monitoring" nav entry (a separate placeholder) is a
  different concern and is not touched by this ticket.
- Docker image management (list / pull / remove images).

## Acceptance Criteria

- **AC-1** — Given the Docker daemon is running and at least one container from `docker-compose.yml` is up,
  when the user opens the Docker view, then the view displays a table with one row per container showing
  the container name, image, status, and CPU/memory columns, and the row count matches the number of
  containers returned by `docker ps`.

- **AC-2** — Given a container is in a `restarting` or `exited` state, when the Docker view is rendered,
  then that container's status cell displays a non-green status indicator (amber for `restarting`, red for
  `exited`/`dead`) that is visually distinct from the green indicator for `running`.

- **AC-3** — Given the Docker daemon is not running (socket unreachable) or the `docker` CLI is not
  installed, when the user opens the Docker view, then the view displays an error banner with the message
  "Docker is not reachable" (or the specific CLI error) and does not throw an unhandled exception or show
  an empty table with no explanation.

- **AC-4** — Given `infrastructure.dockerEnabled` is `false` in the config, when the user opens the Docker
  view, then the view displays "Docker monitoring is disabled. Enable it in Settings → Infrastructure."
  and does not query the Docker daemon.

- **AC-5** — Given a container is listed in the Docker view, when the user clicks the container's name
  (or a "Logs" action button), then the view opens a log panel showing the last 200 lines of that
  container's stdout/stderr logs, and the log content matches the output of `docker logs --tail 200 <name>`.

- **AC-6** — Given the Docker view is open and auto-refresh is enabled, when a container transitions from
  `running` to `exited` (or vice versa), then the view updates the container's status within one refresh
  interval (default 5 s) without requiring the user to reload the page.

- **AC-7** — Given the `docker:list` IPC channel is called with Docker not installed, when the main
  process attempts to query the daemon, then the IPC returns `{ ok: false, code: 'unavailable', message:
  "Docker CLI not found or daemon not reachable" }` and the renderer surfaces this as an error banner
  (not a crash).

- **AC-8** — Given the Docker view is rendering a container list, when the Docker daemon is unreachable
  for a single refresh cycle (transient network/socket hiccup), then the view retains the last known
  container list and shows a non-blocking "Connection lost — retrying…" notice rather than clearing the
  table or crashing.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit (also `spec set SPEC-0043 modules developer-cockpit`) |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none — the cockpit is the sole consumer of the new IPC |
| Knowledge base | `oms-knowledge-base/non-functional-requirements/NFR-007-observability.md` should note that the cockpit now surfaces container-level observability locally (additive note, no restructuring) |

## Open Questions

- [resolved] Should the Docker service use the `docker` CLI or talk to the Docker socket directly →
  **assumption: use the `docker` CLI via `child_process.execFile`.** Rationale: (a) it is the standard
  interface every developer already has; (b) it avoids bundling a Docker API client dependency; (c) the
  socket is at a machine-specific path (`/var/run/docker.sock` on Linux, a named pipe on Windows, a Unix
  socket on macOS) and the CLI abstracts that; (d) the cockpit already shells out to git, so the pattern is
  established. The config can override the CLI path for non-default installations.
- [resolved] Should container CPU/memory come from `docker stats` or `docker ps` →
  **assumption: use `docker stats --no-stream --format json`** for a one-shot snapshot per refresh cycle.
  `docker ps` does not include CPU/memory; `docker stats` does, and `--no-stream` makes it a one-shot query
  suitable for a 5 s poll.
- [deferred] Should the Docker view support filtering/searching by container name →
  **deferred to a follow-up ticket.** The initial 14-container list is small enough that filtering is not
  needed for the MVP; it can be added when the container count grows.
- [deferred] Should container logs be streamed in real time (WebSocket tail) →
  **deferred.** The initial delivery uses on-demand `docker logs --tail N`; real-time streaming is a
  separate feature that requires a WebSocket channel and is more complex.
