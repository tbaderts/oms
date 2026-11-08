# Verification — SPEC-0053: Developer cockpit monitoring feature

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests ran and passed in the `spec verify` run (evidence/developer-cockpit-2.log, `npm test`,
exit 0). The module has no JVM test-results directory (it is a TypeScript/vitest module), so the
evidence is the vitest run, re-confirmed by an explicit `--reporter=verbose` run of the six monitor
test files (36/36 passed).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | UP health indicator + URL within 10 s of load | `MonitorView.test.tsx` ("shows an UP health indicator and the configured URL on load", "shows a DOWN indicator"); `MonitorService.test.ts` ("AC-1: health() returns the UP status and the configured url"); `monitor-store.test.ts` ("AC-1: load() sets sample + lastUpdated") (evidence/developer-cockpit-2.log) | PASS |
| AC-2 | Orders-by-state tile lists every non-zero state | `prometheusParser.test.ts` ("AC-2: lists each non-zero order state … omitting zero-value states"); `MonitorTiles.test.tsx` ("AC-2: OrdersByStateTile shows one row per state …") (evidence/developer-cockpit-2.log) | PASS |
| AC-3 | Order events total + per-minute rate | `prometheusParser.test.ts` ("AC-3: sums all oms-order-events-total counters"); `MonitorTiles.test.tsx` ("AC-3: OrderEventsTile shows the total and a per-minute rate"); rate computed in `stores/monitor.ts` `computeEventsPerMinute` (evidence/developer-cockpit-2.log) | PASS |
| AC-4 | p99 time-to-ACK (and market) in ms, 1 decimal | `prometheusParser.test.ts` ("AC-4: interpolates the p99 of time-to-ack …", "… time-to-market …", "returns null … no usable buckets", "interpolates within a finite bucket …"); `MonitorTiles.test.tsx` (TimeToAckTile/TimeToMarketTile) (evidence/developer-cockpit-2.log) | PASS |
| AC-5 | Outbox pending / stuck / oldest age as mm:ss | `prometheusParser.test.ts` ("AC-5: parses outbox …"); `MonitorTiles.test.tsx` ("AC-5: OutboxTile shows pending, stuck and the oldest age as mm:ss", "… null oldest age") (evidence/developer-cockpit-2.log) | PASS |
| AC-6 | Unreachable → error banner + last sample kept | `MonitorService.test.ts` ("AC-6: an unreachable oms-core …", "a timeout produces a not-reachable error"); `monitor-store.test.ts` ("keeps the sample and flags connectionLost", "no previous sample sets error"); `MonitorView.test.tsx` (error banner, last-sample-kept) (evidence/developer-cockpit-2.log) | PASS |
| AC-7 | Auto-refresh every 10 s while open | `monitor-store.test.ts` ("AC-7: auto refresh fires a new load every REFRESH_INTERVAL_MS while open", fake timers); the view starts/stops it in a `useEffect` (evidence/developer-cockpit-2.log) | PASS |
| AC-8 | Manual Refresh fires immediately, resets the timer | `monitor-store.test.ts` ("AC-8: manualRefresh() fires a load immediately and restarts the interval after the response") (evidence/developer-cockpit-2.log) | PASS |
| AC-9 | Raw prometheus pane, 5 MB truncation, never throws | `MonitorService.test.ts` ("AC-9: prometheus() returns the raw text", "a body over 5 MB is truncated and flagged truncated"); `RawPrometheusPane.test.tsx` ("shows the raw text …", "shows a truncated notice …", "does not throw on a very large string") (evidence/developer-cockpit-2.log) | PASS |
| AC-10 | Monitoring view is standalone (no cross-view coupling) | `MonitorView.test.tsx` ("AC-10: renders standalone without depending on any other view"); the view reads only `useMonitorStore` / `window.cockpit.monitor` (evidence/developer-cockpit-2.log) | PASS |

## Goal Assessment

The Goal is: *"Add a developer cockpit to OMS for monitoring the system."*

The ticket delivers a **Monitoring** view in the developer cockpit that shows, for the configured
oms-core, its health (UP/DOWN/OUT_OF_SERVICE), the orders currently in each state, the order-event
rate, p99 time-to-ACK and time-to-market, the outbox backlog (pending/stuck/oldest age), and the
raw Prometheus text — refreshed every 10 s while the view is open, with a graceful degraded state
when oms-core is unreachable.

In spirit, the requester asked for "monitoring the system" in the cockpit. The view gives a
developer a single pane to see the OMS's health and headline order-flow/outbox metrics without
leaving the tool. The one honest caveat: "the system" is interpreted as **the OMS domain metrics**
(order flow + outbox, all already metered by SPEC-0038/SPEC-0033) plus the service health, not
JVM/system-level metrics (heap, CPU). That interpretation was recorded as a resolved open question
in the proposal and the user approved the proposal, so it is in scope by agreement. The raw
prometheus pane still exposes `jvm_*` series for anyone who needs them, so nothing is hidden.

No material gap between the goal and the ACs.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No OpenAPI/Avro touched; the cockpit is a TS module with no contract folder |
| P-02 | Specification before code, generated models only | N/A | No API/message model generated; the cockpit parses an external text format |
| P-03 | Never edit generated code | N/A | No generated code in this module |
| P-04 | Contracts evolve compatibly | N/A | No contract changed |
| P-05 | Every state change is recorded in the event log | N/A | No order state is changed by the cockpit |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka produced or consumed |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change; the cockpit touches no database |
| P-08 | Concurrency and idempotency are explicit | PASS | Read-only polls; a `refreshing` guard in `stores/monitor.ts` prevents overlapping fetches |
| P-09 | Commands and queries stay separate | PASS | The cockpit sends no commands; it only GETs actuator endpoints (read-only) |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No state transition performed |
| P-11 | Layering and conventions | PASS | Follows the cockpit's existing layering: renderer store → contextBridge → main IPC → main service; typed result objects; mirrors Docker + API Explorer; no new pattern invented |
| P-12 | Jackson 3 only | N/A | TypeScript module; no Jackson |
| P-13 | Errors and validation follow the framework specs | PASS | No HTTP API to shape as Problem+JSON; every fetch failure is represented in a typed result (`{ok:false,error}`) and surfaced as a banner — no swallowed exceptions |
| P-14 | Test first, every AC proven by an automated test | PASS | All 10 ACs map to named tests (see AC table); each was written before its implementation |
| P-15 | Observability | PASS | The feature is itself observability; `MonitorService` logs poll outcomes via the injected `log` seam (like `OmsHttpService`); no `console.log`/`System.out` in the happy path |
| P-16 | Security | PASS | No secrets in code; the base URL is a user setting, not a secret; reads are GET-only; the renderer CSP is not involved (main process does the fetch) |
| P-17 | Simplicity and dependencies | PASS | No new dependency or build change; `parsePrometheus` is a hand-written pure function (Decision 2 rejects a Prometheus client lib); `package.json`/`vite.config.ts` untouched |
| P-18 | Modules build standalone | PASS | `developer-cockpit` passes `npm run typecheck` + `npm test` (exit 0, evidence/developer-cockpit-1.log, -2.log); no other module touched |
| P-19 | Documentation follows behaviour | PASS | `oms-knowledge-base/architecture/developer-cockpit.md` gained a **Monitoring** section + `sources` entries in the same ticket |

## Independent Review

An independent reviewer (fresh context, skeptical brief) reviewed the ticket against the Goal, all
10 ACs, and all policies. **No blocking findings.** Findings and resolution:

- **[major] AC-2 "zero gauge omitted" was under-proven** — the original test omitted the zero line
  from the fixture rather than feeding it. **Fixed:** the fixture now includes
  `oms-orders-by-state{state="REJ"} 0`, and a new test feeds a zero line directly to
  `parsePrometheus` and asserts it is absent from the output (`prometheusParser.test.ts`).
- **[major] AC-7 "lastUpdated refreshes on success" was not asserted** — the test only counted
  calls. **Fixed:** the AC-7 test now advances the fake clock and asserts `lastUpdated` strictly
  increases across two auto-refresh ticks (`monitor-store.test.ts`).
- **[minor] AC-10 coupling assertion was weak** (only asserted an `h1`). **Fixed:** the test now
  provides *only* `monitor:*` IPC and asserts the view renders its data via both endpoints, proving
  no cross-view coupling (`MonitorView.test.tsx`).
- **[minor] Untested mixed health/metrics partial success.** **Fixed:** a new test covers
  `health ok + metrics failed` → sample kept with the health tile, `parsed` null, no error banner
  (`monitor-store.test.ts`).
- **[minor] Design doc inaccuracy re: tagged Timers.** **Fixed:** design Context now notes the
  Timers carry `leg`/`exDestination` tags (per-tag bucket families) and that the parser sums
  across tags.
- **[minor] Parser location deviated from the design** (`src/main/services` → `src/shared`).
  **Fixed:** design Approach updated to record the change and the reason (the renderer's vite
  config cannot import from `src/main`).
- **[minor] tasks.md T-11 wording was stale** (said a new `oms-concepts` page). **Fixed:** T-11
  now matches the implemented approach (the existing `architecture/developer-cockpit.md` page).
- **[minor] Proposal What-Changes AC-6 bullet was internally contradictory.** **Fixed:** the bullet
  now distinguishes first-ever failure (error banner) from later failure (keep last sample, marked
  stale), matching AC-6's body.
- **[ok / no action] AC-4 "p99.9 if present"** is vacuously satisfied: Micrometer Timers export
  histograms with no precomputed quantile line, so a p99.9 can never appear in the text; the tile
  correctly shows the p99 (approx.). Noted, no change.
- **[ok] All 18 policies** reviewed as PASS or N/A per the design; no `exception` was declared and
  none was needed.

After the fixes, the six monitor test files were re-run: **38/38 pass** (was 36).

## Automated Evidence

From `evidence/last-run.json` (ran 2026-11-07T19:29Z, fingerprint `e6e9ed510adfc245`, result
`pass`, policy errors `[]`). This run is fresh — it was re-run after the independent-review test
fixes (the earlier fingerprint `93dec817e17450fe` is stale):

- `developer-cockpit` → `npm run typecheck` → exit 0, 10 s (evidence/developer-cockpit-1.log)
- `developer-cockpit` → `npm test` → exit 0, 39 s (evidence/developer-cockpit-2.log) — 100 test
  files, 607 tests, all passing (includes the 38 monitor tests: 36 original + 2 added to close the
  reviewer's major findings)
- Policy check: PASS (0 errors, 0 warnings)

## Follow-ups

- **JVM/system metrics** (heap, CPU via `jvm_*` prometheus series) as dedicated tiles — deferred
  by the approved proposal's resolved open question. The raw pane already exposes them.
- **Historical time series / charting** (sparklines, trend comparison over the session) — out of
  scope per the proposal; the current view shows point-in-time values only.
- **Remote (non-local) oms-core confirmation** — the API Explorer requires a host confirmation for
  commands (POST); this feature is GET-only so no confirmation gate is needed. If a future ticket
  adds command-sending to the cockpit's monitoring, it should reuse the `confirmedHost` pattern.

## Verdict

Verdict: GOAL MET
