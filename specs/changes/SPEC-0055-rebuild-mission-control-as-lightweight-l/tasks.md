# Tasks — SPEC-0055: Rebuild mission-control as lightweight load-test tool

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Remove the mission-control prototype (AC-9)
  - files: mission-control/packages/ (delete), mission-control/pnpm-workspace.yaml, mission-control/pnpm-lock.yaml, mission-control/turbo.json, mission-control/tsconfig.base.json, mission-control/docs/ (delete), mission-control/ROADMAP.md, mission-control/node_modules/, mission-control/package-lock.json (untracked; look at it before deleting)
  - verify: `git status mission-control` shows only deletions plus the untracked lock gone, and `ls mission-control` lists no `packages`, `docs`, `pnpm-*`, `turbo.json`

- [x] **T-2** Scaffold the npm package: package.json, tsconfig, vite and vitest config, .gitignore (data/, dist/), an empty Hono server and React entry (AC-9)
  - files: mission-control/package.json, mission-control/tsconfig.json, mission-control/tsconfig.server.json, mission-control/vite.config.ts, mission-control/vitest.config.ts, mission-control/.gitignore, mission-control/index.html, mission-control/src/server/index.ts, mission-control/src/ui/main.tsx, mission-control/src/ui/App.tsx
  - scripts: `dev` (concurrently tsx watch server + vite on 5181 proxying /mc → 8097), `build`, `start`, `typecheck` (tsc --noEmit for ui and server), `test` (vitest run), `e2e` (node scripts/e2e-run.mjs). Dependencies exactly as design D1–D9
  - verify: `cd mission-control && npm install && npm run typecheck` exits 0 and `npm test -- --passWithNoTests` exits 0

- [x] **T-3** Maintainer registers the module in specs/config.json; then set the ticket modules (AC-9)
  - files: specs/config.json (maintainer edit: `"mission-control": { "cwd": "mission-control", "verify": ["npm run typecheck", "npm test"] }`), ticket modules via `spec set`
  - verify: `node specs/tools/spec.mjs set SPEC-0055 modules mission-control,oms-knowledge-base` succeeds and `spec status SPEC-0055` lists both modules

- [x] **T-4** Write the repo layout test, make it green (AC-9)
  - files: mission-control/test/repo/layout.test.ts
  - verify: `cd mission-control && npx vitest run test/repo/layout.test.ts` passes

- [x] **T-5** Shared zod schemas and types: RunConfig (limits from design), OrderSample, RunSummary, Snapshot, TrackerEvent, AiEvent; Clock and FakeClock; JSON-line logger (AC-1, AC-2, AC-5)
  - files: mission-control/src/shared/types.ts, mission-control/src/server/clock.ts, mission-control/src/server/log.ts, mission-control/test/support/FakeClock.ts
  - verify: `cd mission-control && npm run typecheck` exits 0

- [x] **T-6** RunStats test-first: exact nearest-rank percentiles, log-spaced histogram, per-second series (AC-4)
  - files: mission-control/test/server/RunStats.test.ts, mission-control/src/server/run/RunStats.ts
  - verify: `cd mission-control && npx vitest run test/server/RunStats.test.ts` passes

- [x] **T-7** OrderTracker test-first: correlation by sessionId + clOrdId, timeline, figures, µs checkpoint deltas, other sessions ignored (AC-2)
  - files: mission-control/test/server/OrderTracker.test.ts, mission-control/src/server/run/OrderTracker.ts
  - verify: `cd mission-control && npx vitest run test/server/OrderTracker.test.ts -t "builds timeline"` and `-t "ignores messages of other sessions"` pass

- [x] **T-8** OrderTracker deduplication test-first: (orderId, eventId) and (orderId, execId, orderVersion) (AC-3)
  - files: mission-control/test/server/OrderTracker.test.ts, mission-control/src/server/run/OrderTracker.ts
  - verify: `cd mission-control && npx vitest run test/server/OrderTracker.test.ts -t "redelivered messages change nothing"` passes

- [x] **T-9** OmsClient + LoadGenerator test-first: open-loop 5 ms tick, fire-and-forget sends, lateness, achieved rate, generator-limited (AC-1)
  - files: mission-control/test/server/LoadGenerator.test.ts, mission-control/test/support/stubHttp.ts, mission-control/src/server/oms/OmsClient.ts, mission-control/src/server/run/LoadGenerator.ts
  - verify: `cd mission-control && npx vitest run test/server/LoadGenerator.test.ts` passes (both cases)

- [x] **T-10** EventConsumer decode test-first: stub registry serving the oms-contracts .avsc files, Confluent-framed records → TrackerEvent; decode errors counted (AC-2)
  - files: mission-control/test/server/EventConsumer.test.ts, mission-control/test/support/stubRegistry.ts, mission-control/src/server/kafka/EventConsumer.ts
  - verify: `cd mission-control && npx vitest run test/server/EventConsumer.test.ts` passes

- [x] **T-11** RunStore test-first: run.json + samples.ndjson, temp-then-rename, formatVersion, unreadable runs listed (AC-7)
  - files: mission-control/test/server/RunStore.test.ts, mission-control/src/server/run/RunStore.ts
  - verify: `cd mission-control && npx vitest run test/server/RunStore.test.ts` passes

- [x] **T-12** Preflight + RunEngine test-first: lifecycle, join wait, draining and completion timeout, create errors / REJ / incomplete accounting, persistence on finish (AC-5, AC-6, AC-7)
  - files: mission-control/test/server/RunEngine.test.ts, mission-control/src/server/run/Preflight.ts, mission-control/src/server/run/RunEngine.ts
  - verify: `cd mission-control && npx vitest run test/server/RunEngine.test.ts` passes

- [x] **T-13** API routes test-first: /mc runs CRUD, stop, samples, SSE stream ≥ 1 snapshot/s, Problem+JSON, 409/422, preflight refusal sends no order (AC-4, AC-6)
  - files: mission-control/test/server/api.test.ts, mission-control/src/server/api/routes.ts, mission-control/src/server/index.ts, mission-control/src/server/config.ts
  - verify: `cd mission-control && npx vitest run test/server/api.test.ts` passes

- [x] **T-14** AI adapters + InvestigationService + tools test-first with MockLanguageModelV3: all five tools, run window, step clamp, single terminal event, not-configured error (AC-8)
  - files: mission-control/test/server/InvestigationService.test.ts, mission-control/src/server/ai/adapters.ts, mission-control/src/server/ai/InvestigationService.ts, mission-control/src/server/ai/tools.ts
  - verify: `cd mission-control && npx vitest run test/server/InvestigationService.test.ts` passes

- [x] **T-15** Wire investigate and ai/status routes into the API (AC-8)
  - files: mission-control/src/server/api/routes.ts, mission-control/test/server/api.test.ts
  - verify: `cd mission-control && npx vitest run test/server/api.test.ts` passes, including a `/mc/ai/status` not-configured case

- [x] **T-16** UI client and Live run view test-first: useRunStream SSE hook, throughput chart, latency charts per figure, state bars (AC-4)
  - files: mission-control/test/ui/LiveRun.test.tsx, mission-control/src/ui/api.ts, mission-control/src/ui/views/LiveRun.tsx, mission-control/src/ui/components/{ThroughputChart,LatencyChart,StateBars}.tsx
  - verify: `cd mission-control && npx vitest run test/ui/LiveRun.test.tsx` passes

- [x] **T-17** Run result view test-first: figure table, histograms, errors, incomplete orders, generator-limited banner (AC-4, AC-5)
  - files: mission-control/test/ui/RunResult.test.tsx, mission-control/src/ui/views/RunResult.tsx, mission-control/src/ui/components/{FigureTable,Histogram}.tsx
  - verify: `cd mission-control && npx vitest run test/ui/RunResult.test.tsx` passes

- [x] **T-18** Run launcher, run list and navigation in App (AC-1, AC-7)
  - files: mission-control/src/ui/views/RunLauncher.tsx, mission-control/src/ui/views/RunList.tsx, mission-control/src/ui/App.tsx
  - verify: `cd mission-control && npm run typecheck && npm run build` exit 0

- [x] **T-19** Investigate view test-first: streamed tool calls and answer, not-configured message (AC-8)
  - files: mission-control/test/ui/Investigate.test.tsx, mission-control/src/ui/views/Investigate.tsx
  - verify: `cd mission-control && npx vitest run test/ui/Investigate.test.tsx` passes

- [x] **T-20** End-to-end script and README (AC-10)
  - files: mission-control/scripts/e2e-run.mjs, mission-control/README.md
  - verify: `cd mission-control && node --check scripts/e2e-run.mjs` exits 0; README documents env vars, ports, dev/build/e2e

- [x] **T-21** Run the end-to-end check against the compose stack and save the summary as evidence (AC-10)
  - files: specs/changes/SPEC-0055-rebuild-mission-control-as-lightweight-l/evidence/ (written by spec tooling or attached summary)
  - verify: with `docker compose up -d` (oms-core, exchange simulator, broker, schema-registry) and the server running, `cd mission-control && npm run e2e -- --rate 20 --duration 60` exits 0; coordinate with any parallel session before loading the shared stack

- [x] **T-22** Knowledge base: new oms-concepts/mission-control.md, index entry, pointer from exchange-simulator.md §8 (AC-10, P-19)
  - files: oms-knowledge-base/oms-concepts/mission-control.md, oms-knowledge-base/oms-concepts/index.md, oms-knowledge-base/oms-concepts/exchange-simulator.md
  - verify: the three files exist/changed, the new page has the frontmatter used by sibling pages, and `grep -n "mission-control.md" oms-knowledge-base/oms-concepts/index.md oms-knowledge-base/oms-concepts/exchange-simulator.md` finds both links

- [x] **T-23** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0055` exits 0

## Notes

- **T-3 needs the maintainer.** Agents may not edit `specs/config.json`. Implementation can
  proceed through T-1 and T-2 before it, but T-4 and the verify stage depend on it.
- **Parallel sessions.** T-21 loads the shared compose stack and T-22 edits
  `oms-knowledge-base/`. Check with any peer session running a verify on those before starting
  either (see memory: parallel sessions and spec verify).
- T-5's AC list is supporting types only; it has no behaviour of its own.
- Independent review (verify round 1) found a cross-origin POST hole, failed creates that kept
  figures when their events came first, and no allowlist recheck on investigations. The ticket was
  reopened to implement and fixed test-first (design → "Changed after the independent review"). No
  new tasks: the fixes refine T-7, T-13 and T-15, whose verify commands were re-run.
