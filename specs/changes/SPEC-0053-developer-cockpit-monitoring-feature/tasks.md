# Plan — SPEC-0053: Developer cockpit monitoring feature

> Ordered, test-first task list. Each task is one red→green cycle. The module under change is
> `developer-cockpit` (verify: `cd developer-cockpit && npm run typecheck && npm test`). There is
> no contracts, Liquibase, Kafka or Java work in this ticket (see design → Contract/Data/Events:
> all None), so the plan starts at the shared types and goes: types → main service (test-first) →
> IPC wiring → renderer store (test-first) → renderer view + tiles (test-first) → raw pane →
> knowledge base → final `spec verify`.

## Tasks

- [x] **T-1** Add the shared monitor types (AC-1, AC-2, AC-3, AC-4, AC-5, AC-9)
  - files: developer-cockpit/src/shared/types/monitor.ts
  - create `MonitorHealthResult { ok, status:number|null, body:OmsHealth|null, url, error? }`,
    `OmsHealth { status:string, components?:Record<string,{status:string}> }`,
    `MonitorMetricsResult { ok, raw:string|null, url, error?, truncated?:boolean }`,
    `ParsedMetrics { ordersByState:OrderStateCount[], eventsTotal:number,
    timeToAckP99Ms:number|null, timeToMarketP99Ms:number|null,
    outbox:OutboxMetrics }`, `OrderStateCount { state:string; value:number }`,
    `OutboxMetrics { pending:number; stuck:number; oldestAgeSeconds:number|null }`, and
    `MonitorSample { health:MonitorHealthResult|null; metrics:MonitorMetricsResult|null;
    parsed:ParsedMetrics|null; updatedAt:number; url:string }`.
  - verify: `cd developer-cockpit && npm run typecheck` passes with the new file present

- [x] **T-2** Write the prometheus parser with failing tests, then implement it (AC-2, AC-3, AC-4, AC-5)
  - files: developer-cockpit/test/main/prometheusParser.test.ts (new), developer-cockpit/src/main/services/prometheusParser.ts (new), developer-cockpit/test/fixtures/prometheus-sample.txt (new)
  - write `prometheusParser.test.ts` asserting, against a fixture string containing the real
    series names (`oms-orders-by-state{state="NEW"} 3`, a zero line omitted,
    `oms-order-events-total{event="…"} …` for several events,
    `oms-order-time-to-ack-seconds_bucket{le="…"}` lines,
    `oms-order-time-to-market-seconds_bucket{…}`, `oms-outbox-pending`, `oms-outbox-stuck`,
    `oms-outbox-oldest-age-seconds`): `ordersByState` lists each non-zero state with its value;
    `eventsTotal` is the sum of all `oms-order-events-total` lines; `timeToAckP99Ms` /
    `timeToMarketP99Ms` are the interpolated p99 in ms from the buckets (and `null` when the
    fixture omits those buckets); `outbox` carries pending/stuck/oldestAgeSeconds.
  - implement `parsePrometheus(raw: string): ParsedMetrics`: split into lines, skip `#` comments
    and blank lines, match `metricName{label="val",…} value` per series; sum counters; interpolate
    p99 over finite histogram buckets (first bucket with cumcount ≥ 0.99·total, linear
    interpolation between it and the previous bucket; `null` when fewer than 2 finite buckets or
    total 0); missing series → `null`/empty, never throw.
  - verify: `cd developer-cockpit && npx vitest run test/main/prometheusParser.test.ts` passes

- [x] **T-3** Write MonitorService with failing tests, then implement it (AC-1, AC-6, AC-9)
  - files: developer-cockpit/test/main/MonitorService.test.ts (new), developer-cockpit/src/main/services/MonitorService.ts (new)
  - write `MonitorService.test.ts` using the `fakeFetch(routes)` + real `http.createServer`
    patterns from `OmsHttpService.test.ts`: `health()` returns `status:"UP"` + url from
    `GET /actuator/health`; `prometheus()` returns raw text from
    `GET /actuator/prometheus`; a >5 MB body is truncated to 5 MB with `truncated:true` (AC-9);
    a connection-refused/timeout target returns `{ ok:false, error:'oms-core not reachable at
    <url>: …' }` (AC-6), never throwing.
  - implement `MonitorService` with `constructor(getBaseUrl, opts)` (`opts.fetch` injectable,
    `opts.timeoutMs` default `REQUEST_TIMEOUT_MS`, `opts.log`): a private `request(path)` that
    fetches `getBaseUrl()+path` with `Accept: text/plain, application/json`, `AbortSignal.timeout`,
    reads text, truncates over `MAX_BODY_CHARS` (imported from `OmsHttpService`), returns an
    `ApiResponse`-like shape; `health()` parses the JSON body into `OmsHealth`; `prometheus()`
    returns the raw (truncated) text. Mirror `OmsHttpService`'s `reason()` for the error message.
    Never throw.
  - verify: `cd developer-cockpit && npx vitest run test/main/MonitorService.test.ts` passes

- [x] **T-4** Wire the monitor IPC and preload bridge (AC-1, AC-6)
  - files: developer-cockpit/src/main/ipc/monitor.ipc.ts (new), developer-cockpit/src/main/preload.ts, developer-cockpit/src/shared/types/ipc.ts, developer-cockpit/src/main/index.ts
  - add `registerMonitorIpc(ipcMain, configService)` mirroring `docker.ipc.ts`: reads
    `baseUrl` per request from
    `configService.getConfig().infrastructure.omsCoreUrl ?? DEFAULT_OMS_CORE_URL`, constructs one
    `MonitorService`, handles `monitor:health` and `monitor:metrics`, always resolves. Add the
    `monitor` group to `preload.ts` (`health`/`metrics` → `ipcRenderer.invoke`), add the matching
    `monitor` block to `CockpitAPI` in `ipc.ts` importing the new shared types, and call
    `registerMonitorIpc` in `index.ts` alongside the other `register…Ipc` calls.
  - verify: `cd developer-cockpit && npm run typecheck` passes (the new IPC/preload/ipc types compile together)

- [x] **T-5** Write the monitor store with failing tests, then implement it (AC-1, AC-6, AC-7, AC-8)
  - files: developer-cockpit/test/renderer/monitor-store.test.ts (new), developer-cockpit/src/renderer/stores/monitor.ts (new)
  - write `monitor-store.test.ts` with a mocked `window.cockpit.monitor` and `vi.useFakeTimers()`:
    `load()` sets `sample` + `lastUpdated` from a successful health+metrics result; a failed poll
    with a previous sample keeps the sample and sets `connectionLost:true` (AC-6), a failed poll
    with no previous sample sets `error`; `startAutoRefresh(10000)` fires a new load every 10 s
    (AC-7); `manualRefresh()` fires a load immediately at t=0 and restarts the interval after the
    response (AC-8); a `refreshing` guard prevents overlapping loads.
  - implement the zustand store `useMonitorStore` with `sample`, `error`, `connectionLost`,
    `refreshing`, `lastUpdated`, `REFRESH_INTERVAL_MS=10_000`, and `load`/`startAutoRefresh`/
    `stopAutoRefresh`/`manualRefresh` as specified in the design (load fires `monitor:health` and
    `monitor:metrics` in parallel via `Promise.all`; on success sets `sample`+`parsed`; on failure
    applies the keep-last-sample logic).
  - verify: `cd developer-cockpit && npx vitest run test/renderer/monitor-store.test.ts` passes

- [x] **T-6** Build the MonitorView shell + health tile with failing tests, then implement (AC-1, AC-10)
  - files: developer-cockpit/test/renderer/MonitorView.test.tsx (new), developer-cockpit/src/renderer/views/monitor/MonitorView.tsx (new), developer-cockpit/src/renderer/views/monitor/HealthTile.tsx (new)
  - write `MonitorView.test.tsx` (mock `window.cockpit`, seed the store): the view renders the
    header (title, configured base URL, "Last updated" timestamp, Refresh button) and an "UP"
    indicator from a `status:"UP"` health (AC-1); it renders standalone with no dependency on any
    other view's store (AC-10); on `error && !sample` it shows the destructive error banner with
    the URL; with `connectionLost` it keeps the last sample visible with its timestamp (AC-6).
  - implement `MonitorView` (mount `useMonitorStore` auto-refresh in a `useEffect` on mount, clear
    on unmount; render `HealthTile`, the tiles from T-7, and `RawPrometheusPane` from T-9) and
    `HealthTile` (coloured UP/DOWN/OUT_OF_SERVICE badge).
  - verify: `cd developer-cockpit && npx vitest run test/renderer/MonitorView.test.tsx` passes

- [x] **T-7** Build the metric tiles with failing tests, then implement (AC-2, AC-3, AC-4, AC-5)
  - files: developer-cockpit/test/renderer/MonitorTiles.test.tsx (new), developer-cockpit/src/renderer/views/monitor/OrdersByStateTile.tsx (new), developer-cockpit/src/renderer/views/monitor/OrderEventsTile.tsx (new), developer-cockpit/src/renderer/views/monitor/TimeToAckTile.tsx (new), developer-cockpit/src/renderer/views/monitor/TimeToMarketTile.tsx (new), developer-cockpit/src/renderer/views/monitor/OutboxTile.tsx (new)
  - write `MonitorTiles.test.tsx` seeding the store with a parsed sample: `OrdersByStateTile`
    shows one row per state with its count and omits zero-value states (AC-2);
    `OrderEventsTile` shows the total and a per-minute rate (AC-3); `TimeToAckTile` /
    `TimeToMarketTile` show the p99 in ms (1 decimal) or "–" when `null` (AC-4); `OutboxTile`
    shows pending, stuck and oldest age formatted as mm:ss (AC-5).
  - implement the five tile components reading from `useMonitorStore`'s `parsed`.
  - verify: `cd developer-cockpit && npx vitest run test/renderer/MonitorTiles.test.tsx` passes

- [x] **T-8** Add the raw prometheus pane with a failing test, then implement (AC-9)
  - files: developer-cockpit/test/renderer/RawPrometheusPane.test.tsx (new), developer-cockpit/src/renderer/views/monitor/RawPrometheusPane.tsx (new)
  - write `RawPrometheusPane.test.tsx`: the pane renders the raw text in a read-only selectable
    `<pre>`; when `truncated` it shows a "truncated" notice; it does not throw on a very large
    string.
  - implement `RawPrometheusPane` reading `metrics.raw` + `metrics.truncated` from the store.
  - verify: `cd developer-cockpit && npx vitest run test/renderer/RawPrometheusPane.test.tsx` passes

- [x] **T-9** Swap the ContentArea placeholder for the real MonitorView (AC-10)
  - files: developer-cockpit/src/renderer/components/layout/ContentArea.tsx
  - replace the `monitoring: lazy(() => Promise.resolve({ default: () => <PlaceholderView
    name="Monitoring" /> }))` line with a lazy import of `@/views/monitor/MonitorView`.
  - verify: `cd developer-cockpit && npx vitest run test/renderer/MonitorView.test.tsx` passes and `npm run typecheck` passes (no remaining placeholder reference)

- [x] **T-10** Run the full module verification (all ACs)
  - files: (none)
  - run the module's complete gate; fix any failures the per-task runs did not surface.
  - verify: `cd developer-cockpit && npm run typecheck && npm test` passes

- [x] **T-11** Add the knowledge-base page for the Monitoring view (P-19)
  - files: oms-knowledge-base/architecture/developer-cockpit.md (existing Developer Cockpit
    component page — the right home for a cockpit view, not `oms-concepts/` which is for OMS domain
    concepts)
  - add a **Monitoring** section documenting what the view shows, which oms-core actuator endpoints
    it reads (`/actuator/health`, `/actuator/prometheus`), the 10 s poll cadence, and how to
    interpret the tiles (p99 is approximate; the raw pane is the source of truth); add the new
    source files to the page's `sources` front-matter.
  - verify: `oms-knowledge-base/architecture/developer-cockpit.md` contains a `## Monitoring`
    section and lists the monitor source files in its `sources`

- [x] **T-12** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0053` exits 0
