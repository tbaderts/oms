# Design — SPEC-0043: Docker monitoring for developer-cockpit

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The developer-cockpit is an Electron app with a strict main/renderer separation: the main process
hosts services that talk to external systems (git, the filesystem, the knowledge base, oms-core's
HTTP API), and the renderer is a React SPA that talks to the main process exclusively through a
`contextBridge`-exposed `CockpitAPI` object (`src/main/preload.ts`). Every capability follows the
same three-part pattern:

1. **Main-process service** — a class under `src/main/services/` or `src/main/<domain>/` that
   encapsulates the external call (e.g. `KbService`, `FsService`, `GitService` via `simple-git`,
   `OmsHttpService`).
2. **IPC registration** — a `register<Ipc>(ipcMain, deps)` function under `src/main/ipc/` that
   wires `ipcMain.handle('<domain>:<action>', …)` to the service. Registered in
   `src/main/index.ts` → `registerAllIpc()`.
3. **Renderer** — a view under `src/renderer/views/<domain>/` that calls
   `window.cockpit.<domain>.<action>()` and renders the result.

The closest existing example is **`FsService` + `registerFsIpc` + the File Explorer view**
(`src/main/services/FsService.ts`, `src/main/ipc/fs.ipc.ts`,
`src/renderer/views/file-explorer/FileExplorerView.tsx`). Another is **`KbService` +
`registerKbIpc`** (`src/main/services/KbService.ts`, `src/main/ipc/kb.ipc.ts`). The AI assistant
(`src/main/ai/AiService.ts`, `src/main/ipc/ai.ipc.ts`) is the most recently added and shows the
pattern for a feature that shells out to an external process and needs graceful error handling when
the external dependency is absent.

The current state of the Docker view: `ContentArea.tsx` maps the `docker` `ViewId` to a lazy
`PlaceholderView name="Docker"`. The `dockerEnabled` field already exists in
`InfrastructureConfig` (`src/shared/types/config.ts` line 58) and is toggled in
`SettingsView.tsx` (line 339). No main-process code touches Docker today.

The `docker-compose.yml` at the repo root defines 14+ containers on a `app-net` bridge network.
The Docker daemon runs on the host machine (not inside the stack).

## Approach

Three new files, two modified files, following the established IPC + service + renderer pattern.

### New files

**`src/shared/types/docker.ts`** — shared types:
```ts
export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  /** running | restarting | exited | dead | paused | created */
  status: string;
  /** healthy | unhealthy | starting | '' (no healthcheck) */
  health: string;
  /** Uptime string, e.g. "Up 5 minutes" or "Exited (1) 2 minutes ago" */
  state: string;
  /** CPU percentage from `docker stats`, e.g. "0.42". '' when the daemon is unreachable. */
  cpu: string;
  /** Memory usage from `docker stats`, e.g. "128MiB / 8GiB". '' when unreachable. */
  memory: string;
  /** Published ports, e.g. "0.0.0.0:8090->8090/tcp". '' when none. */
  ports: string;
}

export interface DockerStats {
  ok: boolean;
  code?: string;
  message?: string;
  containers?: DockerContainer[];
}

export interface DockerLogs {
  ok: boolean;
  code?: string;
  message?: string;
  logs?: string;
}
```

**`src/main/services/DockerService.ts`** — the main-process service. Shells out to the `docker`
CLI via `child_process.execFile` (injected for testability):

```ts
export class DockerService {
  constructor(private execFile: typeof import('child_process').execFile,
              private dockerPath: string = 'docker') {}

  async listContainers(): Promise<DockerStats> {
    // 1. execFile(dockerPath, ['ps', '-a', '--format', 'json'])  → name, image, status, health, state, ports
    // 2. execFile(dockerPath, ['stats', '--no-stream', '--format', 'json']) → CPU, memory per container
    // 3. Merge by container ID; return { ok: true, containers }
    // On ENOENT or non-zero exit: return { ok: false, code: 'unavailable', message }
  }

  async getLogs(containerName: string, lines: number = 200): Promise<DockerLogs> {
    // execFile(dockerPath, ['logs', '--tail', String(lines), containerName])
    // On ENOENT: { ok: false, code: 'unavailable', message }
    // On non-zero exit: { ok: false, code: 'not_found', message }
    // Success: { ok: true, logs }
  }
}
```

**`src/main/ipc/docker.ipc.ts`** — IPC registration:
```ts
export function registerDockerIpc(ipcMain: IpcMain, deps: DockerIpcDeps): void {
  // deps: { configService: ConfigService, dockerPath?: string }
  // 'docker:list'  → DockerService.listContainers()
  // 'docker:logs'  → DockerService.getLogs(container, lines)
}
```

### Modified files

**`src/shared/types/ipc.ts`** — add to `CockpitAPI`:
```ts
docker: {
  list(): Promise<DockerStats>;
  logs(container: string, lines?: number): Promise<DockerLogs>;
};
```

**`src/main/preload.ts`** — add to the `api` object:
```ts
docker: {
  list: () => ipcRenderer.invoke('docker:list'),
  logs: (container, lines) => ipcRenderer.invoke('docker:logs', container, lines),
},
```

**`src/main/index.ts`** — import `registerDockerIpc`, call it in `registerAllIpc()`:
```ts
registerDockerIpc(ipcMain, { configService, dockerPath: process.env.COCKPIT_DOCKER_PATH });
```

**`src/renderer/components/layout/ContentArea.tsx`** — swap the `docker` entry from
`PlaceholderView` to the new `DockerView`:
```ts
docker: lazy(() => import('@/views/docker/DockerView').then(m => ({ default: m.DockerView }))),
```

**`src/renderer/views/docker/DockerView.tsx`** (new) — the renderer view:
- On mount: check `config.infrastructure.dockerEnabled`; if `false`, show the disabled notice (AC-4).
- If enabled: call `window.cockpit.docker.list()`; on success render a table of
  `DockerContainer[]`; on `{ ok: false }` show the error banner (AC-3, AC-7).
- Auto-refresh: `setInterval` at the configured interval (default 5 s); on a transient failure
  (the daemon was reachable in a previous cycle) retain the last list and show a
  "Connection lost — retrying…" notice (AC-8).
- Each row's name is clickable → calls `window.cockpit.docker.logs(name, 200)` and opens a
  log panel showing the output (AC-5).
- Status cell: green dot for `running`, amber for `restarting`, red for `exited`/`dead` (AC-2).

**`src/renderer/stores/docker.ts`** (new) — a Zustand store holding:
- `containers: DockerContainer[] | null`
- `error: string | null`
- `connectionLost: boolean`
- `logs: { container: string; content: string } | null`
- `refreshIntervalMs: number`
- `load()`, `setLogs()`, `clearLogs()`

**`src/renderer/views/settings/SettingsView.tsx`** — in the Infrastructure tab, add a
"Refresh Interval (seconds)" numeric input bound to a new `dockerRefreshIntervalSeconds` field in
`InfrastructureConfig` (default 5). Also a "Docker CLI Path" text input (default `docker`,
overridable for non-standard installations).

### Config changes

**`src/shared/types/config.ts`** — add to `InfrastructureConfig`:
```ts
dockerRefreshIntervalSeconds: number;  // default 5
dockerPath?: string;                    // default 'docker'
```

## Contract Changes

None — this feature is entirely within the Electron app's own IPC surface. No OpenAPI or Avro
contracts are affected. The `CockpitAPI` type is internal to the cockpit (it is the shape of the
`contextBridge`-exposed object, not a network API).

## Data & Persistence

None — the cockpit does not persist Docker data. Container state is always fetched live from the
Docker daemon; no database, no local cache beyond the in-memory Zustand store.

## Events & Messaging

None — no Kafka topics, no `order_events`, no outbox messages. The Docker data flows through the
Electron IPC (main → renderer via `ipcRenderer.invoke`) and is not broadcast over the WebSocket.
The renderer polls on its own timer; no event-driven push is needed for a 5-second refresh cycle.

## Domain, State & Orchestration

None — this is not an OMS domain feature. There are no order state transitions, no task pipelines,
no state machine changes. The "state" is the Docker container status as reported by the daemon,
which the cockpit displays read-only. Validation is minimal: the `lines` parameter to
`docker:logs` is clamped to [1, 1000] in the IPC handler (P-13).

## Alternatives & Decisions

**D-1: Docker CLI vs. Docker API client library**
- **Chosen:** `docker` CLI via `child_process.execFile`.
- **Rejected:** a Node.js Docker API client (e.g. `dockerode`).
- **Why:** (a) no new dependency (P-17); (b) the CLI is already installed on every machine that
  runs the OMS stack (it is how `docker-compose.yml` is started); (c) the cockpit already shells
  out to `git` (via `simple-git`) and `node` (for spec tickets), so the pattern is established;
  (d) the socket path differs by OS (`/var/run/docker.sock`, `\\.\pipe\docker_engine`,
  `~/Library/Containers/com.docker.docker/Data/...`) and the CLI abstracts that.

**D-2: `docker ps` + `docker stats` vs. `docker stats` alone**
- **Chosen:** two separate calls — `docker ps -a --format json` for the container list (name,
  image, status, health, state, ports) and `docker stats --no-stream --format json` for CPU/memory.
- **Why:** `docker ps` does not include CPU/memory; `docker stats` does but only for running
  containers and is a heavier call. Two quick calls are cheaper than one heavy one and give a
  complete picture including stopped containers (which `docker stats` omits).

**D-3: Polling vs. WebSocket push for container status**
- **Chosen:** polling from the renderer at a configurable interval.
- **Rejected:** a WebSocket channel from the main process that pushes container status changes.
- **Why:** the Docker daemon has no efficient "watch" API for status changes (you would have to
  poll `docker events` in the main process and forward each event); a 5-second poll of
  `docker ps` is negligible overhead for a developer tool. A WebSocket push adds a main-process
  polling loop and a new event type for marginal benefit.

**D-4: Log retrieval — on-demand vs. streaming**
- **Chosen:** on-demand `docker logs --tail N` per click.
- **Rejected:** real-time streaming log tail (WebSocket).
- **Why:** streaming requires a persistent WebSocket connection per container, a main-process
  `docker logs -f` child process to manage, and a new event type. The initial use case is
  "click a failing container and see why it crashed" — a one-shot `--tail 200` is sufficient.
  Streaming can be a follow-up ticket.

**New dependency:** none. The `docker` CLI is an external binary, not an npm dependency.
`child_process.execFile` is Node.js built-in. No `package.json` changes.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `docker stats --no-stream` can hang if the daemon is unresponsive | `execFile` with a 10 s timeout; on timeout, return the last known list with `connectionLost: true` (AC-8) |
| `docker ps --format json` output format may vary between Docker versions | Parse defensively: wrap `JSON.parse` in a try/catch; on parse failure, fall back to `docker ps --format '{{json .}}'` line-by-line, or return `{ ok: false, code: 'parse_error' }` |
| A large number of containers (unusual for this stack) makes the poll slow | The OMS stack has 14 containers; `docker ps` is a single daemon API call. No pagination needed. If it ever grows, the interval is user-configurable. |
| The `docker` binary is not on `PATH` in the Electron main process (GUI-launched apps may have a minimal `PATH`) | The config field `dockerPath` lets the user specify the full path (e.g. `/usr/local/bin/docker`). The IPC handler resolves `dockerPath` from config, falling back to `'docker'`. Tests inject a fake `execFile`. |
| Container names with special characters break `execFile` argument passing | `execFile` does not go through a shell, so no shell-injection risk. Container names from `docker ps` are passed as discrete argv elements, not interpolated into a command string. |

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit | `DockerService.test.ts#listContainers_returnsAllContainers` | Given a fake `execFile` that returns a canned `docker ps` + `docker stats` JSON, `listContainers()` returns a `DockerStats` with `ok: true` and one `DockerContainer` per line, with name, image, status, CPU, memory correctly merged. |
| AC-2 | unit | `DockerService.test.ts#listContainers_preservesStatusValues` | Given containers with statuses `running`, `restarting`, `exited`, `dead`, the returned `DockerContainer[]` preserves those status strings (the renderer maps them to colors). |
| AC-3 | unit | `DockerService.test.ts#listContainers_returnsUnavailable_whenCliMissing` | Given a fake `execFile` that rejects with `ENOENT`, `listContainers()` returns `{ ok: false, code: 'unavailable', message: /not found or not reachable/ }`. |
| AC-4 | unit | `DockerView.test.tsx#showsDisabledNotice_whenDockerDisabled` | Given a `cockpit` mock with `config.load()` returning `dockerEnabled: false`, rendering `DockerView` shows "Docker monitoring is disabled" and does not call `docker.list()`. |
| AC-5 | unit | `DockerService.test.ts#getLogs_returnsTailLines` | Given a fake `execFile` that returns canned log lines, `getLogs('oms-core', 200)` returns `{ ok: true, logs }` and the fake was called with `['logs', '--tail', '200', 'oms-core']`. |
| AC-6 | unit | `DockerView.test.tsx#updatesStatus_onRefresh` | Given a first `docker.list()` returning a container as `running`, then a second call (simulating a timer tick) returning it as `exited`, the view's status cell updates without a full reload. |
| AC-7 | unit | `docker.ipc.test.ts#dockerList_returnsUnavailableResult_whenCliMissing` | Given `registerDockerIpc` with a fake `execFile` that rejects, invoking `docker:list` returns `{ ok: false, code: 'unavailable', message }`. |
| AC-8 | unit | `DockerView.test.tsx#retainsLastList_onTransientFailure` | Given a first successful `docker.list()`, then a second call that returns `{ ok: false }`, the view still shows the previous containers and displays "Connection lost — retrying…". |

Additionally:
- `docker.ipc.test.ts` (new file, mirrors `ai.ipc.test.ts` pattern) — tests the IPC handler
  wiring: valid args, invalid args (empty container name, non-string), and the `docker:logs`
  `lines` clamping.
- `DockerService.test.ts` (new file) — tests the service logic with an injected fake `execFile`.
- `DockerView.test.tsx` (new file) — renderer component tests with a mocked `window.cockpit`.

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No OpenAPI or Avro contracts are involved; this is an Electron IPC feature |
| P-02 | Specification before code, generated models only | n/a | No API or message contracts; no generated models |
| P-03 | Never edit generated code | n/a | No generated code is involved |
| P-04 | Contracts evolve compatibly | n/a | No shared contracts are changed |
| P-05 | Every state change is recorded in the event log | n/a | No OMS domain state changes; Docker container state is external and read-only |
| P-06 | Kafka only through the transactional outbox | n/a | No Kafka messaging is involved |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database schema changes |
| P-08 | Concurrency and idempotency are explicit | n/a | No concurrent writes or idempotency concerns; the feature is read-only polling |
| P-09 | Commands and queries stay separate | comply | The Docker feature is purely a query (read-only); no command/write path exists |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No OMS state transitions |
| P-11 | Layering and conventions | comply | Follows the established main/renderer IPC pattern: `DockerService` (service) → `registerDockerIpc` (IPC) → `DockerView` (renderer). Constructor injection of `execFile` for testability, matching the `AiService` pattern |
| P-12 | Jackson 3 only | n/a | This is a TypeScript/Node.js module, not Java |
| P-13 | Errors and validation follow the framework specs | comply | The IPC handler validates `lines` (clamped to [1, 1000]) and `container` (non-empty string); the service returns typed error results (`{ ok: false, code, message }`) rather than throwing. The renderer surfaces errors in a banner, never an unhandled exception |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Every AC maps to a named test in the Test Strategy table; tests are written before implementation (test-first per the spec-implement skill) |
| P-15 | Observability | comply | The `DockerService` logs a warning via `console.warn` on each failed daemon call (consistent with the existing `AiService` and `KbService` logging). No `System.out` or `printStackTrace` equivalents |
| P-16 | Security | comply | No secrets in code or config. The `dockerPath` config field is a file path, not a credential. The `docker` CLI authenticates to the daemon via the socket, not via a key in the config. The renderer never sees the daemon socket path |
| P-17 | Simplicity and dependencies | comply | No new npm dependencies. Uses the built-in `child_process.execFile` and the already-installed `docker` CLI. The feature is the smallest change that meets all 8 ACs |
| P-18 | Modules build standalone | comply | Only the `developer-cockpit` module is affected; its `npm run typecheck` and `npm test` are the verify commands (per `specs/config.json`) |
| P-19 | Documentation follows behaviour | comply | `oms-knowledge-base/non-functional-requirements/NFR-007-observability.md` is updated with a note that the cockpit now surfaces local container-level observability (additive paragraph, no restructuring) |

## Knowledge Base Updates

- `oms-knowledge-base/non-functional-requirements/NFR-007-observability.md` — add a paragraph
  under the local development section noting that the developer-cockpit now includes a Docker
  container monitoring view (Infrastructure → Docker) that shows live container status,
  CPU/memory, and on-demand logs for the local `docker-compose.yml` stack. This is an additive
  note; no existing content is restructured.
