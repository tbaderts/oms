# Verification — SPEC-0055: Rebuild mission-control as lightweight load-test tool

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The tests below ran and passed in the `spec verify` run of 2026-11-08T21:51Z, after the
independent-review fixes (`evidence/mission-control-2.log`: 37/37 in the main pass, then 3/3 in
the isolated `LoadGenerator` pass).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | R×D creates at the configured rate, each ≤ 50 ms late despite 1 s responses; achieved rate reported; `generator-limited` below 95 % | `test/server/LoadGenerator.test.ts#sends rate×duration requests on schedule despite slow responses`, `#flags generator-limited below 95 percent`, `#reports create errors and timeouts through onError` | PASS |
| AC-2 | Per-order timeline, five figures from scheduled send time, checkpoint deltas; other sessions ignored | `test/server/OrderTracker.test.ts#builds timeline, figures and checkpoint deltas`, `#ignores messages of other sessions`; wire-format decode in `test/server/EventConsumer.test.ts#decodes OrderMessage and OrderExecution from the wire format` (µs timestamps above 2⁵⁰ round-trip exactly) | PASS |
| AC-3 | Redelivered `OrderMessage` / `OrderExecution` changes nothing | `test/server/OrderTracker.test.ts#redelivered messages change nothing` (JSON-equal samples, figure stats, state counts and series before and after), `#a second fill with a new execId is not a duplicate but does not move first-fill`; the redelivery test also asserts the execution count stays 1 | PASS |
| AC-4 | Snapshot ≥ 1/s; live throughput, percentiles over time, state counts; result table and histograms; percentiles equal a reference | `test/server/api.test.ts#stream pushes a snapshot at least once per second` (≥ 3 snapshots, gaps ≤ 1.1 s, then `done`); `test/server/RunStats.test.ts#percentiles equal the reference computation` (n up to 20 000, exact equality); `test/ui/LiveRun.test.tsx#renders throughput, percentiles over time and state counts`; `test/ui/RunResult.test.tsx#renders figure table, histograms, errors and incomplete orders` | PASS |
| AC-5 | 4xx, 5xx and timeout creates, venue rejects and incomplete orders counted and listed; run continues; no false figures | `test/server/RunEngine.test.ts#counts create errors, venue rejects and incomplete orders and continues` (400, 503, timeout, REJ with reason, LIVE past timeout; figure counts 7/7/6/5; errored samples have no figures); `test/server/OrderTracker.test.ts#a failed create is not tracked`, `#a create that fails after its events arrived contributes nothing (AC-5)`, `#events that arrive before the 201 count once the 201 arrives`; UI lists in `RunResult.test.tsx` | PASS |
| AC-6 | Refused before any order when the host is not allowlisted or oms-core, Kafka or the registry is unreachable | `test/server/api.test.ts#refuses a run when a preflight check fails` (all four cases: 422 Problem+JSON naming the check, zero `/api/command/execute` requests, consumer never started); `test/server/RunEngine.test.ts#refuses a run whose preflight fails and sends nothing`, `#refuses a run when the consumer group cannot join`; live smoke: allowlist refusal for `example.com` | PASS |
| AC-7 | A finished run survives a restart with the same config, summary, percentiles and samples | `test/server/RunStore.test.ts#a saved run reads back identically from a new store` (new store instance, deep equality), `#lists newest first and reports unreadable runs without failing` | PASS |
| AC-8 | Bounded agent loop with five tools over the run window; tool calls and answer streamed; not-configured message, rest works | `test/server/InvestigationService.test.ts#agent calls every tool and streams the answer` (all five tools hit the expected URLs with the run window, ≤ 4 000-char tool events, one terminal `ai:done`), `#caps the steps and stops at the bound`, `#not configured yields a configuration error`; `test/server/api.test.ts#reports AI status and streams an investigation of a stored run (AC-8)`; `test/ui/Investigate.test.tsx` (3 tests) | PASS |
| AC-9 | No prototype left (`packages/`, pnpm, turbo, `@mastra/*`); module registered with passing typecheck and test | `test/repo/layout.test.ts#no prototype remains and the module is registered`; `specs/config.json` `modules["mission-control"]`; `evidence/mission-control-1.log` (typecheck, exit 0), `evidence/mission-control-2.log` (test, exit 0) | PASS |
| AC-10 | Live stack, 60 s at 20/s MARKET BUY AAPL: 1200 FILLED, 1200 samples per figure, no errors or incomplete orders, not generator-limited | Manual run `20261108-180802-13a2` with `npm run e2e -- --rate 20 --duration 60`, exit 0; summary in `e2e-run-summary.json`: FILLED 1200/1200, every figure count 1200, 0 create errors, 0 incomplete, achieved 19.998/s, p99 lateness 15.5 ms | PASS |

## Goal Assessment

The requester's goal, point by point:

| Goal | Where it is met |
|---|---|
| Create orders from a REST client at a configurable rate | Open-loop generator with rate, duration and order template (AC-1); configurable in the UI launcher |
| Subscribe to order and execution messages to track state and latency | `oms_orders` and `oms_order_executions` consumer with Avro decoding, correlation and deduplication (AC-2, AC-3) |
| Show graphics for key figures (time to order live, time to market ack, time to fill, …) | Live line charts per figure, throughput and state charts, result histograms and table (AC-4). The live run showed the real distribution, e.g. time to filled p50 102 ms / p99 5.3 s |
| Investigate results via an AI agent | Investigate panel with five read-only tools (AC-8) |
| A lightweight framework like developer-cockpit's, not Mastra | Same Vercel AI SDK `streamText` loop and provider seam as developer-cockpit; Mastra removed (D1, AC-9) |
| Start over; discard the existing stuff | The whole prototype and its docs were deleted (AC-9) |

**Gaps and deliberate limits.**
- **"Time to order live" and "time to market ack" are one figure (`toLive`).** In today's OMS the
  venue's accept is what makes an order LIVE. The proposal's resolved assumption records this,
  and the figure is labelled with both names.
- **Not yet checked with a real model.** The AI agent is verified with a scripted model. A live
  provider run needs an API key; none was configured in this session.
- **Scope left out on purpose** (proposal → Out of scope): cancel/replace scenarios, a scenario DSL,
  run comparison, scheduled runs, and rates above 200/s.

None of these is a material gap against the goal.

## Policy Review

The policies were checked against the working-tree diff. It covers `mission-control/` (the
prototype deleted, the new package added), the three knowledge-base files and `specs/config.json`.
Other uncommitted changes in the tree belong to SPEC-0047–0050.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | No `.avsc` or OpenAPI files in mission-control. Test fixtures build the schemas from `oms-contracts/src/main/avro` (`test/support/stubRegistry.ts`) |
| P-02 | Specification before code, generated models only | PASS | No contract change. The zod types cover only fields the tool sends or reads from the existing contracts; no Java model classes involved |
| P-03 | Never edit generated code | N/A | No generated code |
| P-04 | Contracts evolve compatibly | N/A | No contract change; decoding is by writer schema |
| P-05 | Every state change is recorded in the event log | N/A | The tool changes no OMS state itself; creates go through the command API |
| P-06 | Kafka only through the transactional outbox | N/A | Consumer only; no producer exists in the code |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database change |
| P-08 | Concurrency and idempotency are explicit | PASS | Deduplication keys tested (AC-3); one active run, with the slot reserved before the first await (`RunEngine.start`) and 409 on a second start (`RunEngine.test.ts#allows one active run…`); unique `clOrdId` per order |
| P-09 | Commands and queries stay separate | PASS | Writes only `POST /api/command/execute`; the agent's history tool uses `GET /api/query/orders/{id}/events` |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No OMS transitions |
| P-11 | Layering and conventions | PASS | Routes → `RunEngine` / `InvestigationService` → `OmsClient` / `EventSource` / `RunStore`. The agent follows developer-cockpit's `AiService` and `forConfig` |
| P-12 | Jackson 3 only | N/A | No Java code |
| P-13 | Errors and validation follow the framework specs | PASS | Every error answer, including the new 403/415, is `application/problem+json` (asserted in `api.test.ts`); zod validation of `RunConfig`, query params and investigate bodies. Failures are counted and logged, not swallowed: decode errors in `decodeErrors`, create errors in the summary, store and consumer failures logged |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | AC-1–9 by vitest tests (table above); AC-10 by the scripted e2e run with an exit code, as designed |
| P-15 | Observability | PASS | JSON-line logger with `runId` / `clOrdId` / `orderId`; no `console.log` in `src/`. The tool's own telemetry export is out of scope by the proposal |
| P-16 | Security | PASS | Keys only from `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, never written to run files; host allowlist, rechecked before investigations; server bound to 127.0.0.1; `POST /mc/*` only as `application/json` and only from the UI's own origins (`api.test.ts#refuses cross-origin and non-JSON POSTs…`; added after the independent review); zod at the API boundary; Kafka records reduced field by field with type checks. Runtime dependencies audit clean after the upgrades in design → Changed during implementation |
| P-17 | Simplicity and dependencies | PASS | Every dependency is recorded in design D1–D9 plus Changed during implementation (`avsc` dev dependency, major-version upgrades). Remaining dev-only vitest advisories are recorded there |
| P-18 | Modules build standalone | PASS | `mission-control` passes its own verify commands; no Gradle module touched |
| P-19 | Documentation follows behaviour | PASS | New `oms-concepts/mission-control.md`, index entry, pointer in `exchange-simulator.md` §8, README rewritten |

## Independent Review

The spec-reviewer agent reviewed the ticket twice.

**Round 1** (on the 18:17Z evidence): VERDICT MET, with one major and seven minor findings.

| # | Finding | Resolution |
|---|---|---|
| 1 | major: a web page in the user's browser could start a run or investigation with a cross-origin "simple" POST (text/plain, no preflight); binding to 127.0.0.1 does not prevent it | **Fixed.** `POST /mc/*` needs `application/json` (415 otherwise), and an `Origin`, when present, must be one of the UI's own origins (403 otherwise). Tested in `api.test.ts#refuses cross-origin and non-JSON POSTs…` |
| 2 | a create that timed out after its events arrived still counted in the figures and completions (AC-5) | **Fixed.** Statistics are held until the 201; a failed create discards everything about the order. Two new `OrderTracker` tests |
| 3 | the "order count" option in the proposal's What Changes is not implemented | **Documented** in design → Changed after the independent review; the count is always rate × duration, and no AC covers it |
| 4 | a run whose `store.save` fails vanishes from the list | **Deferred**: follow-up below. A local file write failing is rare, and the failure is logged |
| 5 | design text did not match the code (achieved-rate formula, `RunStore` validation scope, Kafka "zod" claim) | **Fixed** in design.md |
| 6 | an investigation did not recheck the host allowlist before calling a stored run's oms-core | **Fixed.** 422 `allowlist`, tested in `api.test.ts` |
| 7 | verification.md was unfilled | **Fixed** (this document); `e2e-run-summary.json` cited explicitly |
| 8 | commit hygiene: untracked lock file and sources; `specs/config.json` reformat | **Noted** for the maintainer's commit (follow-ups) |

The round-1 weakness in AC-3 (execution deduplication not observable in the test) was fixed by
asserting `executionCount()`.

**Round 2** (after the fixes and the 21:51Z verify): VERDICT MET. Findings 1, 2, 3, 5, 6 and 7 are
resolved; 4 is deferred as agreed; 8 needs no code change. The fixes introduced three new notes, none
blocking:

| # | Finding | Resolution |
|---|---|---|
| N1 | the `executions` counter is not reduced when a failed create had executions | **Accepted.** `executionCount()` is not reported anywhere (summary or UI); noted as a follow-up should it ever be |
| N2 | the AC-10 live run predates the fixes | **Accepted.** Held figures are recorded with their original timestamps, so values for created orders are unchanged, and the e2e client sends JSON with no Origin. The reviewer agrees the argument holds |
| N3 | a hand-written `curl -X POST …/stop` now needs `Content-Type: application/json` | **Accepted.** The README shows no curl examples, and its security note states the JSON requirement |

No blocking finding is open.

## Automated Evidence

`evidence/last-run.json`:
- ran at 2026-11-08T21:51:25Z (fingerprint `9c251271c908d39d`), result `pass`;
- modules `mission-control`, `oms-knowledge-base`;
- policy check over changes since main (merge-base 6bd232af): PASS, no errors or warnings.

| Command | Exit | Time |
|---|---|---|
| `npm run typecheck` | 0 | 8 s (`evidence/mission-control-1.log`) |
| `npm test` | 0 | 14 s (`evidence/mission-control-2.log`): 11 files / 37 tests, then `LoadGenerator` 3/3 |

AC-10 live run: `e2e-run-summary.json` in the ticket folder (run `20261108-180802-13a2`, exit 0). It ran before the review fixes. None of them changes the measured path for successful creates: the origin guard does not apply to the e2e client, which sends JSON with no Origin, and deferring figures until the 201 changes nothing for orders that were created.

## Verdict

Verdict: GOAL MET

Every acceptance criterion passes:
- AC-1 to AC-9 by automated tests in the 21:51Z `spec verify` run;
- AC-10 by the live end-to-end run, all 1200 orders FILLED.

Every policy is PASS or N/A, both independent reviews returned MET with no open blocking finding,
and the goal assessment finds no material gap.

## Follow-ups

- **Market round-trip tail.** The AC-10 run found a large tail at a low rate (20/s): market
  round-trip p95 4.7 s / p99 5.2 s, against OMS processing p99 about 52 ms. It sits in the
  outbox → simulator → commands → consumer loop. Worth a ticket of its own (it is the open question
  from SPEC-0024's baseline); Mission Control's Investigate panel is the intended tool for it.
- **Exercise the AI investigation with a live provider key** against a real run.
- **Keep a run whose save failed** (review finding 4). Today, if `RunStore.save` throws, the run
  is logged as failed and disappears from the list. Keep it in memory as FAILED and show the error.
- **Commit hygiene** (review finding 8): include `mission-control/package-lock.json` and the new
  untracked files. `specs/config.json` also carries a whole-file reformat besides the new entry.
- **Optional: code-split the UI bundle** (712 kB, Vite warning). Harmless for a local tool.
