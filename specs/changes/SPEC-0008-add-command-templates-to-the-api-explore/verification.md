# Verification — SPEC-0008: Add command templates to the API Explorer

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All test files below ran and passed in the latest `spec verify` run (evidence/developer-cockpit-2.log:
217 tests). Test paths are relative to `developer-cockpit/test/`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Command blocks listed by type with name fallbacks; others skipped; unusable blocks shown with reason | `shared/httpFile.test.ts#"parses requests, names, comments and file variables"`, `renderer/api-templates.test.ts#"classifies command blocks by type and reports unusable ones"`, `renderer/ApiExplorer.templates.test.tsx#"lists templates under their command type and loads one"`; T-10 runtime: 9 starter templates listed under 7 types | PASS |
| AC-2 | Changes on disk reflected without restart; missing source shown, others load | `main/ApiTemplateService.test.ts#"lists shared and extra sources and marks a missing one"`, `main/WatcherService.test.ts#"watches api-templates and the extra template paths"`, `renderer/ApiExplorer.templates.test.tsx#"reloads templates on a .http file event"`; T-10 runtime: a saved file appeared in the list and disappeared when deleted (add/unlink through the real watcher) | PASS |
| AC-3 | Variables resolved per send (`$guid` fresh, send time, file variable, followed orderId); History stores the resolved body | `renderer/api-templates.test.ts#"resolves system, file and orderId variables"`, `renderer/ApiExplorer.templates.test.tsx#"sends the resolved body with fresh values each time"` and `#"resolves variables after the non-local confirmation"`, `main/apiExplorer.ipc.test.ts#"records each send including failures, not follow-ups"` (history stores the body passed in); T-10 runtime: two sends with distinct `clOrdId`s, `sendingTime` = send time | PASS |
| AC-4 | Unresolved variable → no request, finding names it | `renderer/api-templates.test.ts#"reports unresolved variables"`, `renderer/ApiExplorer.templates.test.tsx#"does not send a body with unresolved variables"` | PASS |
| AC-5 | Save appends one block, existing bytes unchanged, optional variables, readable back, duplicate name refused | `main/ApiTemplateService.test.ts#"appends a template block without changing existing bytes"` and `#"refuses a duplicate name, an unknown path and an existing new file"`, `renderer/api-templates.test.ts#"templatize replaces per-send fields"` and `#"inlineFileVariables…"`, `renderer/ApiExplorer.templates.test.tsx#"saves the editor body as a template"` and `#"saving a template elsewhere keeps it sendable…"`; T-10 runtime: new file created with `@baseUrl` + block | PASS |
| AC-6 | Use as template from follow-up/Orders → OrderCreateCmd, server fields dropped, fresh ids/times, passes check | `renderer/api-templates.test.ts#"orderToTemplate keeps client fields and drops server fields"`, `renderer/ApiExplorer.followup.test.tsx#"Use as template fills an OrderCreateCmd body from the order"`, `renderer/ApiExplorer.orders.test.tsx#"URL shown equals URL sent, … row opens follow-up"` (button in the Orders tab's follow-up); T-10 runtime | PASS |
| AC-7 | Starter templates cover every type and pass the check; INTC starter 201 and not rejected | `renderer/api-templates.test.ts#"starter templates cover every command type and pass the check"`; T-10 runtime (tasks.md Notes): "INTC limit buy" → 201 twice; follow-up v1 NEW_ORDER/UNACK, v2 ACK/LIVE, v3 FILL/FILLED | PASS |

## Goal Assessment

The goal asks for these things:
- templates like the REST Client ones;
- values that change per send: a unique `clOrdId`, current timestamps and the followed `orderId`;
- import from `.http` files;
- saving from what was already sent.

All of them are delivered and proven above. The templates *are* REST Client files, so
`rest.http`-style bodies work in both tools and no import format is needed. The starter files
replace typing about twenty fields with one click and produce orders the simulator fills. "Savable
from what was sent" works in two ways: Restore from History, then Save as template; or Use as
template on any order.

The review found that a template saved into a file other than its own lost its file variables.
That is fixed: the dialog defaults to the template's own file, and undeclared variables are written
inline.

Left out on purpose (proposal non-goals):
- simulator-aware pre-send warnings;
- scenarios;
- GET templates;
- editing blocks in the cockpit;
- REST Client environments;
- changing `oms-core/rest.http`, which keeps its `<orderId>` placeholders. A user can still add it
  as a source.

No material gap.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | No contract copies. Templates are example requests, checked against the contracts in oms-contracts (AC-7 test). |
| P-02 | Specification before code, generated models only | PASS | Command types, Use-as-template field list and checks come from the contracts at runtime. |
| P-03 | Never edit generated code | N/A | TypeScript cockpit only; no generated code. |
| P-04 | Contracts evolve compatibly | N/A | No contract change. |
| P-05 | Every state change is recorded in the event log | N/A | The cockpit changes no order state. |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka. |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database. |
| P-08 | Concurrency and idempotency are explicit | PASS | Saves are append-only from the single main process, with `wx` for new files. No automatic retries. `{{$guid}}` for `commandId` is opt-in through the save switch. |
| P-09 | Commands and queries stay separate | PASS | Templates cover commands only; GET blocks are ignored, and the Orders tab is unchanged. |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions implemented. |
| P-11 | Layering and conventions | PASS | Pure parser in `shared/httpFile.ts`, pure logic in `renderer/lib/api-templates.ts`, I/O in `ApiTemplateService` behind IPC, state in the zustand store, dialog from `components/ui`. Same structure as SPEC-0007. |
| P-12 | Jackson 3 only | N/A | TypeScript only. |
| P-13 | Errors and validation follow the framework specs | PASS | Missing sources, unusable blocks, unresolved variables and refused saves are shown with their reasons. IPC validates the save request and never throws. Since the finding-1 fix, saves no longer produce templates that can't be sent. |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Each task's tests were seen red first (tasks.md). Every AC maps to passing tests. Add/unlink live reload and the AC-7 runtime half are also shown by the T-10 runtime check. |
| P-15 | Observability | PASS | `[api-explorer] template saved <name> → <path>` is logged per save (asserted in `ApiTemplateService.test.ts`). Sends keep their existing log line. |
| P-16 | Security | PASS | Writes are limited to listed sources or a new `name.http` in the shared folder (path whitelist, file-name pattern, `wx`; tested). The template URL is ignored, so the host guard is unchanged. No secrets in the starter files. |
| P-17 | Simplicity and dependencies | PASS | No new dependency, and `developer-cockpit/package.json` is unchanged by this ticket. The R10 warnings in the policy check concern `build.gradle`, `docker-compose.yml`, `settings.gradle` and the oms-contracts/simulator build files. Those are uncommitted changes from earlier work on this branch, which this ticket doesn't touch. |
| P-18 | Modules build standalone | PASS | developer-cockpit `npm run typecheck` and `npm test` pass; no OMS module touched. |
| P-19 | Documentation follows behaviour | PASS | `developer-cockpit/spec/03-features.md`, `04-backend-services.md` and `05-data-model.md` updated, including the review fixes. |

## Independent Review

The spec-reviewer agent's verdict was **MET**, with every AC proven. It re-ran the 9 relevant test
files (41/41). Its findings and their resolution:

1. **[major] Template saved into another file lost its file variables** and could not be sent.
   For example, "INTC limit buy" saved to the default target `lifecycle.http`, where `{{sessionId}}`
   and `{{account}}` were undeclared.
   - **Fixed in T-13:**
     - the dialog defaults to the template's own file;
     - `inlineFileVariables` writes undeclared file variables as their values, keeping system
       variables.
   - Tests: `api-templates.test.ts#"inlineFileVariables…"` and
     `ApiExplorer.templates.test.tsx#"saving a template elsewhere keeps it sendable…"`.
2. **[minor] Duplicate-name check ignored the `<type> #n` fallback.**
   - **Fixed:** `effectiveNames` in `shared/httpFile.ts`, used by `ApiTemplateService.save`.
   - Test added to `ApiTemplateService.test.ts#"refuses a duplicate name…"`.
3. **[minor] Variables were resolved before the non-local confirmation**, so a slow confirm sent a
   stale time.
   - **Fixed:** the check for unresolved names runs first, and values are resolved after the
     confirmation.
   - Test: `#"resolves variables after the non-local confirmation"`.
4. **[minor] `orderToTemplate` copied `expireTime`.**
   - **Fixed:** it is dropped. The test order now has an `expireTime`, and the test asserts it is
     absent.
5. **[minor] verification.md unfilled.** Fixed by this document.
6. **[minor] Misplaced doc comment** on `saveTemplate`. Fixed.

The reviewer's note on AC-3 (`$timestamp`/`$randomInt` are proven at unit level, not through a
send) was accepted. Both use the same resolver as `$guid`, which is proven end to end.

## Automated Evidence

`evidence/last-run.json`, from 2026-10-27T15:51:52Z (after the last code change):
- **Result:** pass; module developer-cockpit.
- **`npm run typecheck`:** exit 0 (`developer-cockpit-1.log`).
- **`npm test`:** exit 0 (`developer-cockpit-2.log`): 45 files, 217 tests passed.
- **Policy check:** no errors, 6 P-17 warnings about build files outside this ticket (see P-17
  above).

## Follow-ups

- Simulator-aware pre-send warnings (unknown symbol, price outside the band), deferred in the
  proposal. The simulator's reference prices would be read from its `application.yml`.
- `oms-core/rest.http` could switch its `<orderId>` placeholders to `{{orderId}}` and
  `{{$guid}}`, which would make it a ready template source as well.
- The `sessionId` contract mismatch (SPEC-0007 follow-up 1) is still open. The starter templates
  always set `sessionId`.

## Verdict

Verdict: GOAL MET
