# Design — SPEC-0053: Developer cockpit monitoring feature

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The developer cockpit is an Electron + React (Vite + TypeScript + vitest) workbench. The renderer
never talks to oms-core directly; it calls `window.cockpit.<feature>` over a contextBridge
(`src/main/preload.ts`), which maps to an IPC channel handled in the main process by a
`register…Ipc` function in `src/main/ipc/`. The main process owns all I/O.

Two existing flows are the closest models for this change:

- **API Explorer** (`src/main/services/OmsHttpService.ts` + `src/main/ipc/apiExplorer.ipc.ts`):
  `OmsHttpService` takes a `getBaseUrl: () => string` (read per request from
  `ConfigService.getConfig().infrastructure.omsCoreUrl`, default `http://localhost:8090`) and
  `fetch`es oms-core. It **never throws** — every failure comes back as an `ApiResponse`
  (`{ ok, status: number|null, durationMs, body, contentType, url, error? }`). It enforces a
  10 s `AbortSignal.timeout` and truncates bodies over 5 MB (`MAX_BODY_CHARS`). Non-local hosts
  require a `confirmedHost` for commands. `apiExplorer.ipc.ts` wires it to channels and always
  resolves.
- **Docker monitoring** (SPEC-0043, `src/main/services/DockerService.ts` + `src/main/ipc/docker.ipc.ts`):
  the closest "monitoring" sibling. `DockerService` returns a typed `DockerStats`
  (`{ ok, code?, message?, containers? }`), never throwing. The renderer store
  (`src/renderer/stores/docker.ts`) distinguishes a first-ever failure (`error`) from a
  transient one when a previous good value exists (`connectionLost` keeps the last sample on
  screen), and the view (`src/renderer/views/docker/DockerView.tsx`) renders it.

The **`monitoring` view already exists as a placeholder**: `src/renderer/stores/navigation.ts`
declares `ViewId 'monitoring'` with `NAV_ITEMS` `{ id:'monitoring', label:'Monitoring',
group:'Infrastructure', icon:'Activity' }`, and `src/renderer/components/layout/ContentArea.tsx`
maps it to `PlaceholderView name="Monitoring"`. This ticket replaces the placeholder with the real
view; no sidebar/navigation change is needed (AC-10 is already structurally satisfied).

oms-core (Spring Boot) already publishes the needed signals via Spring Boot Actuator.
`src/main/resources/application.yml` exposes `health,info,prometheus,metrics,projections` on
`/actuator/*`. The relevant Micrometer meters (all already registered at startup, so the series
are present from the first export):

- `oms.orders.by_state` — a `Gauge` per `State` tag (`oms-orders-by-state{state=…}`), read from
  `OrderRepository.countByState` (`OrderFlowMetrics.java`). `State` ∈ { NEW, UNACK, LIVE,
  FILLED, CXL, REJ, CLOSED, EXP } (`oms-contracts/src/main/avro/State.avsc`).
- `oms.order.events` — a `Counter` per `Event` tag (`oms-order-events-total{event=…}`).
- `oms.order.time_to_ack` / `oms.order.time_to_market` / `oms.order.oms_processing_time` /
  `oms.order.market_round_trip` — `Timer`s with `leg` and `exDestination` tags
  (`OrderSlaRecorder.java`). A Prometheus `Timer` exports a `_seconds` histogram (`_seconds_bucket`
  lines per tag combination, plus `_seconds_count` and `_seconds_sum`); because the Timers carry
  `leg`/`exDestination` tags, `/actuator/prometheus` contains per-tag bucket families. The parser
  sums the buckets across all tag values to derive a single p99 (the headline, not per-leg).
- `oms.outbox.pending` (gauge `oms-outbox-pending`), `oms.outbox.stuck` (gauge
  `oms-outbox-stuck`), `oms.outbox.oldest.age` (gauge `oms-outbox-oldest-age-seconds`, base unit
  seconds) — registered in `OutboxRelay.java`.

Note on metric naming: the Prometheus registry converts Micrometer names by replacing `.` with
`-` and lower-casing, so `oms.order.events` → `oms-order-events` (a counter exposes
`oms-order-events-total`). The parser must key off the Prometheus-form names, not the Micrometer
names.

Framework specs read: `openapi-contracts.md` and `testing-patterns.md` (not applicable to the
Electron app but read for completeness). The cockpit is a TypeScript module, so the Java
framework specs (state machine, task orchestration, validation, error-handling, domain model)
do not apply; the cockpit's own conventions (thin store → service, typed result objects, never
throw across IPC) are the patterns to follow (P-11 analogue).

## Approach

The cockpit gains one new IPC feature, `monitor`, following the Docker/API-Explorer pattern:
renderer store → contextBridge → main IPC → main service → oms-core actuator.

**Main process (new files):**
- `src/main/services/MonitorService.ts` — the core service. Constructed with
  `getBaseUrl: () => string` (same injection shape as `OmsHttpService`) and a
  `fetch` seam (default `fetch`, injectable for tests). Two methods:
  - `health(): Promise<MonitorHealthResult>` → `GET <base>/actuator/health`. Returns
    `{ ok, status: number|null, body: OmsHealth|null, error? }`. `OmsHealth = { status: string,
    components?: Record<string,{status:string}> }`.
  - `prometheus(): Promise<MonitorMetricsResult>` → `GET <base>/actuator/prometheus`. Returns
    `{ ok, raw: string|null, error?, truncated?: boolean }`. Reuses the 10 s timeout and the
    5 MB truncation from `OmsHttpService` (import `REQUEST_TIMEOUT_MS`, `MAX_BODY_CHARS`).
  - Never throws; a connection failure returns `{ ok:false, error:'oms-core not reachable at
    <base>: <reason>' }` (same `reason()` logic as `OmsHttpService`, extracted or mirrored).
  - A shared private `request(path)` does the fetch + timeout + truncation, mirroring
    `OmsHttpService.request` but returning the raw text (the prometheus endpoint is
    `text/plain`).
- `src/shared/prometheusParser.ts` — a pure, dependency-free function
  `parsePrometheus(raw: string): ParsedMetrics` that turns the Prometheus text exposition format
  into a typed object for the tiles. **Changed during implementation:** placed in `src/shared`
  (not `src/main/services`) and called from the renderer store, because the renderer's vite config
  only resolves `@` → `src/renderer` and `@shared` → `src/shared` — it cannot import from
  `src/main`. The parser has no Node/electron dependencies, so sharing it is safe. This keeps the
  single source of truth for the series names in one file.
  - `ordersByState: { state: string; value: number }[]` from `oms-orders-by-state{state="…"}`
    gauge lines.
  - `eventsTotal: number` — sum of all `oms-order-events-total{…}` counter lines.
  - `timeToAckP99Ms: number|null` and `timeToMarketP99Ms: number|null` — computed from the
    `oms-order-time-to-ack-seconds_bucket` / `oms-order-time-to-market-seconds_bucket` histogram
    lines via linear-interpolation quantile (see Alternatives).
  - `outbox: { pending: number; stuck: number; oldestAgeSeconds: number|null }` from
    `oms-outbox-pending`, `oms-outbox-stuck`, `oms-outbox-oldest-age-seconds`.
  - Missing series are represented as `null` / empty arrays, never as exceptions.
- `src/main/ipc/monitor.ipc.ts` — `registerMonitorIpc(ipcMain, configService)`, mirrors
  `docker.ipc.ts`. Reads `baseUrl` per request from
  `configService.getConfig().infrastructure.omsCoreUrl ?? DEFAULT_OMS_CORE_URL`. Two channels:
  `monitor:health` → `MonitorHealthResult`, `monitor:metrics` → `MonitorMetricsResult`. Always
  resolves.
- `src/main/index.ts` — call `registerMonitorIpc(ipcMain, configService)` alongside the other
  `register…Ipc` calls.

**Shared types (new file):**
- `src/shared/types/monitor.ts` — `MonitorHealthResult`, `OmsHealth`,
  `MonitorMetricsResult`, `ParsedMetrics`, `OrderStateCount`, `OutboxMetrics`,
  `MonitorSample` (the combined health+metrics+timestamp shape the store keeps). Exported types
  only (the cockpit's `src/shared` convention, as in `docker.ts`/`apiExplorer.ts`).

**Renderer (new files):**
- `src/renderer/stores/monitor.ts` — zustand store. State: `sample: MonitorSample|null`,
  `error: string|null`, `connectionLost: boolean`, `refreshing: boolean`,
  `lastUpdated: number|null`. Actions: `load()` (fires both `monitor:health` and
  `monitor:metrics` in parallel; on success sets `sample` + `lastUpdated`, on failure applies the
  Docker-style keep-last-sample logic), `startAutoRefresh(intervalMs)`, `stopAutoRefresh()`,
  `manualRefresh()`. The 10 s timer is a `setInterval` started in the view's `useEffect` on mount
  and cleared on unmount (see AC-7); `manualRefresh()` fires immediately and the interval is
  reset after the response lands. A `REFRESH_INTERVAL_MS = 10_000` constant lives in the store.
- `src/renderer/views/monitor/MonitorView.tsx` — replaces the `ContentArea` placeholder for
  `'monitoring'`. Renders, top to bottom: a header ("Monitoring", the configured base URL, a
  "Last updated <timestamp>" line, and a "Refresh" button wired to `manualRefresh()`); an error
  banner (destructive) when `error && !sample`; a `connectionLost` notice when the last sample is
  stale; then the tiles; then the raw prometheus pane.
- `src/renderer/views/monitor/HealthTile.tsx` — the UP/DOWN/OUT_OF_SERVICE indicator (AC-1).
- `src/renderer/views/monitor/OrdersByStateTile.tsx` — one row per state with a count (AC-2).
- `src/renderer/views/monitor/OrderEventsTile.tsx` — total + per-minute rate (AC-3).
- `src/renderer/views/monitor/TimeToAckTile.tsx` / `TimeToMarketTile.tsx` — p99 in ms (AC-4).
- `src/renderer/views/monitor/OutboxTile.tsx` — pending, stuck, oldest age as mm:ss (AC-5).
- `src/renderer/views/monitor/RawPrometheusPane.tsx` — a read-only `<pre>` with the raw text and
  a "truncated" notice when `truncated` (AC-9).

**Renderer (changed files):**
- `src/main/preload.ts` — add a `monitor` group:
  `monitor: { health: () => ipcRenderer.invoke('monitor:health'),
  metrics: () => ipcRenderer.invoke('monitor:metrics') }`.
- `src/shared/types/ipc.ts` — add the `monitor` block to `CockpitAPI`, importing the new shared
  types.
- `src/renderer/components/layout/ContentArea.tsx` — replace the `monitoring` placeholder line
  with a lazy import of `MonitorView`.
- `src/renderer/stores/monitor.ts` auto-refresh uses the existing `eventBus`? No — the cockpit's
  Docker view polls on its own timer; the Monitor view does the same (no WebSocket needed).

**What-Changes mapping (proposal → where):**
- "New Monitor view in the sidebar" → the view already exists as a placeholder (AC-10);
  `ContentArea.tsx` swaps it for `MonitorView`.
- "health status with a refresh" → `HealthTile` + `monitor:health` + `manualRefresh()`.
- "headline tiles: orders by state, events rate, tta/ttm p99, outbox" → the five tile components
  + `parsePrometheus`.
- "raw prometheus pane" → `RawPrometheusPane` + `monitor:metrics`.
- "poll every 10 s while open, show last sample with timestamp, error state when unreachable" →
  `stores/monitor.ts` auto-refresh + keep-last-sample logic (AC-6, AC-7).
- "manual Refresh resets the timer" → `manualRefresh()` (AC-8).
- "no oms-core changes" → nothing touches `oms-core/`.

## Contract Changes

None — this is an internal change to the `developer-cockpit` Electron module. It reads
actuator endpoints that are **not** part of the contracted OpenAPI/Avro command/query API
(`oms-contracts/src/main/{openapi,avro}` are untouched). No generated model is produced. (P-01,
P-02, P-03, P-04 are n/a — see Policy Compliance.)

## Data & Persistence

None — the cockpit is a read-only viewer. It stores no data of its own; each sample is in memory
only. No Liquibase changelog, no migration, no backfill.

## Events & Messaging

None — the cockpit does not produce or consume Kafka messages, and it does not write to
`order_events`. It only reads the already-published actuator endpoints. (P-05, P-06 n/a.)

## Domain, State & Orchestration

None — no order state is changed by this feature. The `orders-by-state` numbers are read from
oms-core's existing gauges; the cockpit does not advance any state machine or task pipeline.
(P-09, P-10 n/a. P-13: the cockpit surfaces errors as in-app banners/typed result objects, not as
HTTP Problem+JSON responses, which is the cockpit's established convention and consistent with the
Docker feature.)

## Alternatives & Decisions

**Decision 1 — Read the two actuator endpoints rather than adding a cockpit-specific JSON
endpoint in oms-core.**
Chosen: `GET /actuator/health` + `GET /actuator/prometheus`, both already exposed.
Rejected: a new `GET /api/monitor` in oms-core returning a pre-shaped JSON. Rejected because it
would (a) require an oms-core + oms-contracts change, pulling two modules and a contract into a
ticket the goal scopes to the cockpit, and (b) duplicate the prometheus exposition. The cockpit
already has `OmsHttpService` plumbing and the prometheus format is stable, so parsing it in the
cockpit is cheaper and keeps oms-core out of scope (per the approved proposal).

**Decision 2 — Parse the Prometheus text in the cockpit (a small pure function) rather than
depending on a full Prometheus client library.**
Chosen: a hand-written `parsePrometheus()` for the specific series the tiles need
(`oms-orders-by-state`, `oms-order-events-total`, `oms-order-time-to-{ack,market}-seconds_*`,
`oms-outbox-*`). Rejected: adding a `prom-client` / `prometheus` npm dependency to parse the
exposition format. Rejected per P-17 — the cockpit only needs ~6 known series, a ~120-line pure
parser is trivially testable, and a general-purpose client is speculative generality. The raw
pane (AC-9) means any other metric is still visible without being parsed. No new dependency is
introduced.

**Decision 3 — Compute p99 from the Prometheus histogram buckets (linear interpolation) rather
than reading a precomputed quantile line.**
Chosen: parse `…-seconds_bucket{le="…"} <count>` lines, find the first bucket with cumulative
count ≥ 0.99·total, and linearly interpolate the quantile between the previous and that bucket's
upper bounds; result in seconds → ms. Rejected: expecting a `quantile="0.99"` line — Micrometer
Timers export histograms, not fixed quantiles, so there is no such line. The interpolation is the
standard Prometheus `histogram_quantile` approximation and is what the proposal's AC-4 asks for.
Edge case: if fewer than 2 finite buckets or total count is 0, return `null` (tile shows "–").

**Decision 4 — Poll on a renderer-side 10 s `setInterval` (like the Docker view) rather than
streaming over the cockpit WebSocket.**
Chosen: a `setInterval` started on view mount, cleared on unmount, each tick firing
`monitor:health` + `monitor:metrics` in parallel; the interval is reset after each completed
response so a slow response cannot stack. Rejected: pushing samples over the existing
`eventBus`/WebSocket — that would require a new main→renderer push channel and reconnection logic
for a feature that only needs a 10 s cadence; the polling model already exists (Docker) and is
simpler (P-17). 10 s matches `OmsHttpService.REQUEST_TIMEOUT_MS` so a request that times out
exactly consumes one full cycle without overlap.

**Decision 5 — Keep the last good sample on screen with a `connectionLost` flag rather than
clearing the tiles on failure.**
Chosen: mirror `stores/docker.ts` — on a failed poll, if a previous `sample` exists set
`connectionLost=true` and keep the sample (with its `lastUpdated` timestamp); if there is no
previous sample, set `error`. Rejected: blanking the view on the first blip — the proposal
(AC-6) explicitly wants the last sample kept, and the Docker feature already proves the pattern.

**No new dependency or build change** (P-17): the feature reuses `fetch`, `AbortSignal`,
`zustand`, `lucide-react`, and the existing vitest setup. `package.json`, `package-lock.json`, and
`vite.config.ts` are untouched.

## Risks & Mitigations

- **Prometheus naming drift:** if oms-core's Micrometer→Prometheus naming changes (e.g. a
  different tag or unit suffix), the tiles would silently show "–". Mitigation: `parsePrometheus`
  keys off the exact series names documented in Context; unit tests assert each tile value against
  a fixture that contains the real series names, so a rename breaks a test loudly. The raw pane
  (AC-9) is the escape hatch — a developer can always see the unparsed text.
- **p99 accuracy:** linear interpolation over a sparse histogram is approximate. Mitigation: the
  tile labels the value "p99 (approx.)"; the raw pane shows the underlying buckets. This matches
  how Prometheus itself approximates `histogram_quantile`.
- **Unreachable oms-core:** the 10 s `AbortSignal.timeout` guarantees a poll cannot hang the view;
  a failure keeps the last sample (Decision 5) and shows the configured URL in the error. The
  `OmsHttpService.test.ts` fake-server pattern is reused so the timeout path is covered.
- **Large prometheus payload:** the 5 MB truncation (reused from `OmsHttpService`) plus the
  "truncated" notice (AC-9) bound memory and keep the pane renderable. The pane is a single
  `<pre>`; at 5 MB it is large but the cockpit is a developer tool and the text is optional.
- **Timer stacking:** the interval is reset after each response completes (AC-7/AC-8), and a
  `refreshing` guard in the store prevents two overlapping fetches from a manual click during a
  poll.
- **CSP / non-local hosts:** reads go through the main process (no renderer fetch), so the
  renderer CSP is not involved. Non-local `omsCoreUrl` is read-only here (the cockpit only GETs
  actuator endpoints), so no `confirmedHost` confirmation is needed — the API Explorer's
  confirmation gate exists for *commands* (POST), which this feature does not send.

## Test Strategy

Tests live under `developer-cockpit/test/` (vitest, `include: test/**/*.test.{ts,tsx}`), following
the Docker feature's layout (`test/main/*` for main-process, `test/renderer/*` for renderer).
Every AC is covered; "integration" here means a real local `http.Server` (the cockpit's analogue
of an integration test, since there is no Postgres/Kafka in the Electron app).

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit + integration | `MonitorService.test.ts#health returns UP with url`; `MonitorView.test.tsx#shows UP health within first load` | `/actuator/health` body `status:"UP"` surfaces as an "UP" indicator with the configured URL, from a fake `fetch` and from a real local HTTP server |
| AC-2 | unit | `prometheusParser.test.ts#ordersByState lists every non-empty state` | a fixture with `oms-orders-by-state{state=…}` for NEW/LIVE/FILLED/CXL (incl. a zero line omitted and a non-zero line present) parses to the expected per-state counts, zero-value states excluded |
| AC-3 | unit | `prometheusParser.test.ts#eventsTotal sums all event counters`; `OrderEventsTile.test.tsx#shows total and per-minute rate` | the sum of `oms-order-events-total{event=…}` lines is correct; the tile shows the total and a rate computed over the elapsed window |
| AC-4 | unit | `prometheusParser.test.ts#timeToAckP99Ms from histogram buckets` | given `oms-order-time-to-ack-seconds_bucket` lines, the interpolated p99 in ms (1 decimal) is within tolerance; returns `null` when no buckets |
| AC-5 | unit | `prometheusParser.test.ts#outbox pending stuck oldest`; `OutboxTile.test.tsx#shows pending stuck and mm:ss` | `oms-outbox-pending`, `oms-outbox-stuck`, `oms-outbox-oldest-age-seconds` parse; the tile renders oldest age formatted as mm:ss |
| AC-6 | unit + integration | `MonitorService.test.ts#unreachable returns not-reachable error`; `monitor-store.test.ts#keeps last sample on failure and flags connectionLost` | connection refused/timeout yields `{ok:false,error:'oms-core not reachable at <url>: …'}`; the store keeps the previous sample and sets `connectionLost` (Docker pattern) |
| AC-7 | unit (store, fake timers) | `monitor-store.test.ts#auto refresh fires every 10s while open` | with `vi.useFakeTimers`, advancing 10 s triggers a new load; `lastUpdated` refreshes on success |
| AC-8 | unit (store, fake timers) | `monitor-store.test.ts#manual refresh fires immediately and resets timer` | clicking Refresh triggers a load at t=0 (not waiting for the next tick) and the interval restarts after the response |
| AC-9 | unit | `prometheusParser.test.ts#truncation keeps 5MB and sets truncated`; `RawPrometheusPane.test.tsx#shows text and truncated notice` | a >5 MB raw body is truncated to 5 MB with `truncated:true`; the pane renders the text and a "truncated" notice, never throwing |
| AC-10 | renderer | `MonitorView.test.tsx#renders standalone without other views` | mounting `MonitorView` in isolation renders the header + tiles + pane and its data comes only from `monitor:*` IPC (no cross-view store dependency) |

Test seams: `MonitorService` receives an injectable `fetch` (as `OmsHttpService` does) and
`getBaseUrl`; the one integration test (`MonitorService.test.ts` unreachable + the UP health)
spins up a real `http.createServer` on `127.0.0.1:0` exactly as `OmsHttpService.test.ts` does.
Renderer tests mount components with `@testing-library/react` and a mocked `window.cockpit`
(preload shape), as `DockerView.test.tsx` does. The prometheus fixture is a small string constant
in `test/shared` containing the real series names from Context.

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No OpenAPI/Avro is added or edited; the cockpit is a TypeScript module with no contract folder |
| P-02 | Specification before code, generated models only | n/a | No API/message model is generated; the cockpit parses an external text format into local TS types |
| P-03 | Never edit generated code | n/a | No generated code is involved in this module |
| P-04 | Contracts evolve compatibly | n/a | No contract is changed |
| P-05 | Every state change is recorded in the event log | n/a | No order state is changed by the cockpit |
| P-06 | Kafka only through the transactional outbox | n/a | No Kafka is produced or consumed by the cockpit |
| P-07 | Schema changes through new Liquibase changesets | n/a | No schema change; no database is touched by the cockpit |
| P-08 | Concurrency and idempotency are explicit | n/a | Read-only polls; no optimistic locking or idempotency concern (the `refreshing` guard prevents overlapping fetches) |
| P-09 | Commands and queries stay separate | n/a | The cockpit sends no commands; it only GETs actuator endpoints (read-only) |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No state transition is performed |
| P-11 | Layering and conventions | comply | Follows the cockpit's existing layering: renderer store (`stores/monitor.ts`) → contextBridge (`preload.ts`) → main IPC (`ipc/monitor.ipc.ts`) → main service (`services/MonitorService.ts`); typed result objects, constructor/param injection, no new pattern (mirrors Docker + API Explorer) |
| P-12 | Jackson 3 only | n/a | TypeScript module; no Jackson |
| P-13 | Errors and validation follow the framework specs | comply | The cockpit is not an HTTP API, so there are no Problem+JSON responses to shape; it follows the framework specs' no-swallowed-exceptions rule by representing every fetch failure in a typed result object (`{ok:false,error}`) surfaced as an in-app banner, matching the Docker/API-Explorer convention |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Test Strategy table maps all 10 ACs to named tests; tests are written before implementation per the implement stage |
| P-15 | Observability | comply | The feature itself is observability (surfacing oms-core metrics); the main service logs poll outcomes via the injected `log` seam like `OmsHttpService`; no `System.out` |
| P-16 | Security | comply | No secrets in code; the base URL is a user setting, not a secret; inputs (none beyond the configured URL) are validated; reads are GET-only |
| P-17 | Simplicity and dependencies | comply | No new dependency or build change (Decision 2 rejects a Prometheus client lib); smallest change that meets the ACs |
| P-18 | Modules build standalone | comply | `developer-cockpit` passes `npm run typecheck` + `npm test` (its `verify` commands); no other module is touched, so no consumer verification needed |
| P-19 | Documentation follows behaviour | comply | Knowledge Base Updates below: a new developer-cockpit concept page for the Monitoring view |

## Knowledge Base Updates

- **Changed during implementation:** the documentation goes into the existing
  `oms-knowledge-base/architecture/developer-cockpit.md` page (the Developer Cockpit component
  page, which already documents the Storyboards view) as a new **Monitoring** section, rather than
  a brand-new file. The cockpit's views live on that component page, not in `oms-concepts/`
  (which is for OMS domain concepts). Reason: P-19 wants the doc where the other cockpit views are
  documented; a separate file would fragment the cockpit's documentation.
  - The new section documents: what the Monitoring view shows, which oms-core actuator endpoints it
    reads (`/actuator/health`, `/actuator/prometheus`), the 10 s poll cadence, and how to interpret
    the tiles (p99 is approximate; the raw pane is the source of truth; zero-value states omitted).
