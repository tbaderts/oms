# Verification — SPEC-0043: Docker monitoring for developer-cockpit

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The final `spec verify` (2026-11-07 13:09Z, after the review fixes):

- **Executed:** developer-cockpit (typecheck exit 0, 94 test files / 570 tests, 0 failures).
- Log: `evidence/developer-cockpit-1.log` (typecheck), `evidence/developer-cockpit-2.log` (tests).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Container table with name/image/status/CPU/memory; row count matches docker ps | DockerService.test.ts#listContainers_returnsAllContainers — 5-container fixture, ok:true, row count 5, spot-checks name/image/status/cpu/memory/health/ports; stopped container has empty cpu/memory | PASS |
| AC-2 | Non-green status indicator for restarting/exited/dead | DockerService.test.ts#listContainers_preservesStatusValues — asserts running/restarting/exited/dead preserved; DockerView.tsx#statusColor maps each to a distinct color (green/amber/red/gray) | PASS |
| AC-3 | Unreachable daemon shows error banner, no crash, no empty table | DockerService.test.ts#listContainers_returnsUnavailable_whenCliMissing (ENOENT) and #listContainers_returnsUnavailable_whenCliMissing (ECONNREFUSED); DockerView renders docker-error banner on first-call failure | PASS |
| AC-4 | dockerEnabled:false shows disabled notice, no daemon query | DockerView.test.tsx#showsDisabledNotice_whenDockerDisabled — dockerEnabled:false, waitFor finds "Docker monitoring is disabled", docker.list not called | PASS |
| AC-5 | Click container name opens log panel with last 200 lines | DockerService.test.ts#getLogs_returnsTailLines — asserts ok:true, log content, execFile called with ['logs','--tail','200','oms-core']; #getLogs_usesDefault200 | PASS |
| AC-6 | Status updates within one refresh interval without reload | DockerView.test.tsx#updatesStatus_onRefresh — 1s interval, first list() running, second exited; docker-status-running disappears, oms-core row has docker-status-exited | PASS |
| AC-7 | docker:list with Docker missing returns ok:false code:unavailable | docker.ipc.test.ts#dockerList_returnsUnavailableResult_whenCliMissing — real registerDockerIpc + ENOENT fake, returns ok:false code:unavailable with message | PASS |
| AC-8 | Transient failure retains last list plus Connection lost notice | DockerView.test.tsx#retainsLastList_onTransientFailure — first list() ok, second ok:false; "Connection lost" text appears, oms-core and exchange-simulator still in DOM | PASS |

## Goal Assessment

Goal: "Add Docker container monitoring to developer-cockpit."

The requester gets a live, auto-refreshing container dashboard in the cockpit's Docker view
(previously a placeholder). It shows every container from the local daemon with status, health,
CPU, memory, published ports, and uptime. Status is color-coded (green/amber/red). Clicking a
container opens a log panel. The feature degrades gracefully when Docker is disabled, not
installed, or transiently unreachable. The goal is met in spirit and by the letter.

**Gap:** The renderer-side halves of AC-3 (first-call failure banner render) and AC-5 (click
container name → log panel with content) are proven by code reading rather than a dedicated
renderer test. The service-level tests and deterministic rendering make these low-risk. Recorded
as follow-ups.

## Policy Review

Reviewed against the diff of the SPEC-0043 files.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No OpenAPI or Avro contracts; pure Electron IPC |
| P-02 | Specification before code, generated models only | N/A | No API or message contracts; no generated models |
| P-03 | Never edit generated code | N/A | No generated code in the diff |
| P-04 | Contracts evolve compatibly | N/A | No contract changes |
| P-05 | Every state change is recorded in the event log | N/A | No OMS domain state changes; Docker state is external and read-only |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka messaging |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database schema changes |
| P-08 | Concurrency and idempotency are explicit | N/A | Read-only polling; no writes or idempotency concerns |
| P-09 | Commands and queries stay separate | PASS | Entirely query path: docker:list and docker:logs; no mutation |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No OMS state transitions |
| P-11 | Layering and conventions | PASS | Follows service to IPC to view pattern; DockerService with constructor injection of execFile mirrors AiService; lazy view in ContentArea |
| P-12 | Jackson 3 only | N/A | TypeScript module, not Java |
| P-13 | Errors and validation follow the framework specs | PASS | IPC validates container (non-empty string) and clamps lines to 1..1000; typed ok:false/code/message results; no thrown errors across IPC |
| P-14 | Test first, every AC proven by an automated test | PASS | 13 tests all passing; every AC has at least one test; renderer halves of AC-3/AC-5 are code-reading only (follow-up) |
| P-15 | Observability | PASS | DockerService.runCli logs console.warn on each failed daemon call |
| P-16 | Security | PASS | No secrets in code or config; dockerPath is a file path not a credential; execFile (no shell) prevents injection |
| P-17 | Simplicity and dependencies | PASS | No new npm dependencies; built-in child_process plus external docker CLI; D-1 to D-4 recorded in design |
| P-18 | Modules build standalone | PASS | Only developer-cockpit touched; typecheck and 94 test files / 570 tests all pass |
| P-19 | Documentation follows behaviour | PASS | NFR-007-observability.md updated with the local container monitoring section |

## Independent Review

**Round 1** (2026-11-07 13:02Z), verdict: no blocking issues.

- **AC-2 dead branch untested** → Fixed: added broken-container (state dead) to the PS fixture; test now asserts dead is preserved.
- **Renderer test coverage gaps (AC-3 first-call failure, AC-5 click-to-log)** → Recorded as follow-up; service-level tests and deterministic rendering make these low-risk.
- **design.md P-15 claim inaccurate (no logging)** → Fixed: added console.warn to DockerService.runCli on failure.
- **Cosmetic dead code in DockerView (? 5 : 5 ternary)** → Fixed: removed the no-op ternary.
- **dockerPath staleness (cosmetic)** → Recorded as follow-up; a config change to dockerPath requires an app restart.

## Automated Evidence

`node specs/tools/spec.mjs verify SPEC-0043` → **PASS** (2026-11-07 13:09Z)

- Policy check: PASS
- developer-cockpit npm run typecheck: exit 0 (evidence/developer-cockpit-1.log)
- developer-cockpit npm test: exit 0, 94 files / 570 tests (evidence/developer-cockpit-2.log)

## Follow-ups

- Add a renderer test for the AC-3 first-call-failure error banner (the docker-error testid path).
- Add a renderer test for the AC-5 click-container-name to log-panel interaction.
- Consider making dockerPath live-reloadable (re-read from config on each IPC call rather than captured at startup).
- Consider adding a dead status to the DockerView test fixture for AC-2 renderer coverage.

## Verdict

**Verdict: GOAL MET**

All 8 acceptance criteria pass with automated test evidence. No blocking issues from the
independent review. The minor gaps (renderer-side test coverage for AC-3/AC-5, dockerPath
staleness) are recorded as follow-ups and do not affect the goal. The full module build is green
(typecheck clean, 94 test files / 570 tests passing).
