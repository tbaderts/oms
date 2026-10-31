# Verification — SPEC-0005: Fix contract paths and merge into Contracts view

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` (`evidence/developer-cockpit-2.log`:
26 files / 96 tests + perf test). Test files are under `developer-cockpit/test/`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Defaults discover oms-contracts files, nothing from oms-core | `main/SpecsService.contracts.test.ts` — "discovers oms-contracts files with the default paths" (exact `.yml`/`.yaml`/`.avsc` set, README excluded, `oms-core` decoys absent); `main/ConfigService.test.ts` — "defaults point at oms-contracts"; runtime: Contracts → Editor listed all 34 repository contract files (3 OpenAPI + 31 Avro) | PASS |
| AC-2 | Legacy saved paths migrated and saved; custom paths kept | `main/ConfigService.test.ts` — "migrates the legacy oms-core contract paths and saves" (file rewritten, all other keys equal), "keeps custom contract paths" (byte-identical file), "migrateConfig is a no-op for current paths" (half-legacy migrates only that array); runtime: the real `~/.developer-cockpit/config.json` was migrated on launch (`[config] migrated legacy contract paths to oms-contracts`; backup kept in the session scratchpad) | PASS |
| AC-3 | New paths apply without restart | `main/specs.ipc.test.ts` — "discovery follows contract paths saved in Settings" (real ConfigService, fake ipcMain; reviewer confirmed `config:save` always yields a new object via IPC structured clone) | PASS |
| AC-4 | Domain Model entities from both sources incl. OrderCreateCmd and Side enum | `main/SpecsService.contracts.test.ts` — "parses domain entities from the repository's oms-contracts"; runtime: Domain Model tab showed `OrderCreateCmd` and `Side` | PASS |
| AC-5 | Two tasks, right module/wrapper/cwd, Windows via cmd.exe, failures, unknown ids, run-all order | `main/CodeGenService.test.ts` (6 tests: task table, posix argv/cwd, `cmd.exe /d /s /c .\gradlew.bat …`, failure output, output kept on kill/timeout, unknown ids never start a process); `renderer/specs-store.test.ts` — "run all runs contract models before API interfaces", "run all stops when contract models fail"; runtime: *API interfaces* ran from the app, `[codegen] api 0 10932ms`; the reviewer ran *Contract models*' exact Windows command in `oms-contracts`: BUILD SUCCESSFUL | PASS |
| AC-6 | One Contracts entry; tabs Editor / Domain Model / Code Generation with their content | `renderer/ContractsView.test.tsx` — "sidebar and palette offer one Contracts entry", "Contracts shows Editor, Domain Model and Code Generation tabs with their content" (incl. no duplicate/old headings), "Dashboard links to Contracts"; `npm run typecheck` (no stale view ids); runtime: old entries absent, tabs present, Monaco opened `oms-cmd-api.yml` | PASS |
| AC-7 | Saves outside the contract folders rejected, file unchanged | `main/SpecsService.contracts.test.ts` — "refuses to save outside the contract folders" (prefix-sibling `avro-old/`, other workspace folder, wrong extension, file outside workspace, contract folder configured outside the workspace; contents unchanged; a valid save works) | PASS |

## Goal Assessment

The Goal: the spec editor tab showed nothing because of the stale `oms-core` paths, as did Domain
Model and Code Generator; fix the paths (defaults and saved config) so they work again, and merge
the three into one Contracts view with tabs.

Met in the running app, not only in tests: the user's own saved config was migrated, the Editor
lists and opens the `oms-contracts` files, Domain Model shows the entities, and code generation runs
the current Gradle tasks (it had been unable to start any task on Windows). The sidebar has one
Contracts entry instead of three. Beyond the letter of the ACs, Settings changes now apply without a
restart and the save guard is tighter.

No gap. Not in scope and unchanged: the Dashboard layout (SPEC-0006), richer contract editing.

## Policy Review

Reviewed against the SPEC-0005 files only (the branch also carries unrelated uncommitted work from
earlier tickets; the six R10 policy-check warnings come from those Gradle/docker-compose files).

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | The cockpit now points only at `oms-contracts/src/main/{openapi,avro}`; no contract folder created. |
| P-02 | Specification before code, generated models only | PASS | Code generation runs the real generator tasks of `oms-contracts`/`oms-core`; nothing hand-written. |
| P-03 | Never edit generated code | PASS | No generated file edited; Gradle wrote `build/generated*` during the runtime check as designed. |
| P-04 | Contracts evolve compatibly | N/A | No contract changed. |
| P-05 | Every state change is recorded in the event log | N/A | No order state. |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka. |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database. |
| P-08 | Concurrency and idempotency are explicit | N/A | No concurrent writers introduced; the config migration is idempotent (a second load is a no-op, tested). |
| P-09 | Commands and queries stay separate | N/A | No OMS API. |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order transitions. |
| P-11 | Layering and conventions | PASS | IPC → services → fs/process; injectable runner like `SpecCli`; tabbed view like `RequirementsView`. |
| P-12 | Jackson 3 only | N/A | TypeScript only. |
| P-13 | Errors and validation follow the framework specs | PASS | Unknown task ids and bad save paths rejected with clear errors; Gradle failures (incl. kill/timeout) returned with their output. |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC traced above; each test was run red first. The real `execFile` runner is covered by the runtime check, not a unit test. |
| P-15 | Observability | PASS | `[config] migrated …`, `[codegen] <id> <exit> <ms>` and `[codegen] … failed` log lines. |
| P-16 | Security | PASS | Renderer sends only a task id (allow-listed); `cmd.exe` gets constant arguments only; save guard requires workspace + contract folder (no prefix siblings) + contract extension. Symlinks inside a contract folder are not resolved (follow-up). |
| P-17 | Simplicity and dependencies | PASS | No new dependency or build change; the three existing views are reused as tabs. |
| P-18 | Modules build standalone | PASS | developer-cockpit `npm run typecheck` + `npm test` (evidence logs 1, 2) and `npm run build`. |
| P-19 | Documentation follows behaviour | PASS | `developer-cockpit/spec/02, 03, 04, 05, 11` updated; no `oms-knowledge-base/` change needed. |

## Independent Review

spec-reviewer verdict: **MET**. It re-ran the tests, ran *Contract models*' exact Windows command
(BUILD SUCCESSFUL), and checked migration vs `merge()`, the Settings object identity, `/s` quoting,
run-all order and the Contracts layout. Findings (all minor) and resolution (T-9):

1. Doc still said `gradlew.bat` instead of `.\gradlew.bat`. **Fixed** (04-backend-services.md, with the reason).
2. "Domain Model" / "Code Generator" headings duplicated or outdated inside the tabs. **Fixed**; covered by the ContractsView test.
3. Save guard: no workspace check in `writeFile`, no realpath. **Fixed** the workspace check (tested with a contract folder configured outside the workspace). Symlink resolution: **follow-up** (paths come from `discoverFiles` under the same root).
4. Gradle output lost when the process is killed or overflows. **Fixed**; output kept and logged (tested).
5. Run all continued after a failed Contract models run. **Fixed** (tested).
6. Unused `Wand2`/`Database` icons in the sidebar. **Removed**.
7. Task cards don't show module and Gradle tasks. **Follow-up** (optional UI detail).
8. verification.md unfilled. **Done** (this document; evidence re-run after the fixes).

## Automated Evidence

`spec verify SPEC-0005` at 2026-10-27T06:23Z: result **pass**, modules `developer-cockpit`.

| Command | Exit | Log |
|---|---|---|
| policy check (changes since main) | PASS (0 errors; 6 R10 warnings from unrelated branch work) | — |
| `npm run typecheck` | 0 (8 s) | `evidence/developer-cockpit-1.log` |
| `npm test` | 0 (34 s; 96 tests + 1 perf test) | `evidence/developer-cockpit-2.log` |

Runtime check (T-7, built app over CDP): Contracts nav present and old entries absent; tabs
`Editor | Domain Model | Code Generation`; 34 files listed; `oms-cmd-api.yml` opened in Monaco;
`OrderCreateCmd`, `Side` visible; *API interfaces* → success (10.9 s, `[codegen] api 0 10932ms`).
The first attempt failed (`'gradlew.bat' is not recognized`, `NoDefaultCurrentDirectoryInExePath=1`)
and led to the `.\gradlew.bat` change recorded in design.md.

## Follow-ups

- Resolve symlinks/junctions (`realpath`) in the contract save guard.
- Show each code generation task's module and Gradle tasks on its card.
- On Windows, a timed-out Gradle run may leave its JVM running after `cmd.exe` is killed (unverified).

## Verdict

Verdict: GOAL MET
