# Verification — SPEC-0002: Integrate spec workflow into developer cockpit

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests are Vitest tests in `developer-cockpit/test/`. They ran and passed in the latest
`spec verify` (`evidence/developer-cockpit-2.log`: 12 files and 37 tests in the parallel run, plus
the sequential performance test; none failed or were skipped). *Integration* tests run the real
`specs/tools/spec.mjs` against a temporary git workspace.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | List maps every front-matter field; archived tickets only with "show archived" | `test/main/SpecTicketsService.test.ts#listTickets maps front-matter of active and archived tickets` (deep-equals every field; archived only via `listTickets(true)`) (evidence/developer-cockpit-2.log) | PASS |
| AC-2 | Stage, tasks 3/5, ACs 4, gate identical to `spec gate` | `SpecTicketsService.test.ts#getTicket reports stage, tasks, ACs and the CLI gate result` (`gate` deep-equals `gate --json`; errors equal the text `ERROR` lines); stage index: `spec-tickets-lib.test.ts#stageIndex uses blockedFrom for blocked tickets` and `TicketDetail.test.tsx` ("Stage implement (current)") | PASS |
| AC-3 | Mine by default, All on toggle, all when no git user | `test/renderer/SpecTicketsView.test.tsx#lists only my tickets by default and all after toggle` and `#lists all tickets by default when no git user is configured`; `spec-tickets-lib.test.ts#filterTickets mine-only, all, and no-user fallback` | PASS |
| AC-4 | Dashboard counts, awaiting and blocked lists, completion %, click opens the ticket | `spec-tickets-lib.test.ts#summarize counts stages, awaiting, blocked and completion`; `test/renderer/SpecOverview.test.tsx#shows summary and opens ticket on click` (exact counts, 50 %, mine first, selection and `activeView === 'spec-tickets'`) | PASS |
| AC-5 | Goal, documents, log, evidence fresh/stale | `SpecTicketsService.test.ts#getTicket returns goal, documents, log and evidence freshness` (real `spec verify` → fresh; edit a module file → stale); `test/renderer/TicketDetail.test.tsx#renders goal, documents, log and evidence` and `#shows fresh evidence and no-evidence states` | PASS |
| AC-6 | External change is visible within 2 s without user action | `test/main/WatcherService.test.ts#broadcasts specs:tickets-changed within 2s of a ticket change` (add, change, remove; a burst gives one event); `test/renderer/specTickets-store.test.ts#refreshes list and open detail on specs:tickets-changed` and `#clears the detail when the open ticket disappears` | PASS |
| AC-7 | Advance fail/pass, other actions equal the CLI, invalid input rejected, output and exit code shown | `test/main/SpecTicketsService.actions.test.ts#advance failing gate keeps stage and returns errors`, `#advance passing gate moves stage or awaits approval`, `#new, reopen, block, unblock, note, autopilot match the CLI` (twin-ticket comparison), `#invalid input is rejected by the CLI without file change`, `#text starting with -- is rejected before the CLI`; `test/renderer/TicketActions.test.tsx#shows exit code and output`, `#runs note, block and reopen through input dialogs`, `#unblock, autopilot and reopen of a blocked ticket`; `test/renderer/NewTicketDialog.test.tsx#shows the CLI rejection of a new ticket` and `#selects the created ticket and shows the output` | PASS |
| AC-8 | Approve needs confirmation, only when awaiting, records git user | `SpecTicketsService.actions.test.ts#approve requires awaiting and records git user` and `#approve refuses without a git user`; `TicketActions.test.tsx#approve needs confirmation and is hidden unless awaiting` | PASS |
| AC-9 | No WebSocket message or AI tool can run an action | `test/main/websocket-no-actions.test.ts#ws messages cannot trigger actions` (`ticket.md` byte-identical) and `#only specTickets.ipc imports SpecTicketsService` (the server has no `message` handler). The AI Assistant is a placeholder view with no tools. | PASS |
| AC-10 | Broken folders become error entries; everything else still works | `SpecTicketsService.test.ts#bad ticket folders become error entries without breaking others` (two error entries; `getTicket` and `note` on a valid ticket; text `spec list` and `spec ci` do not crash); `SpecTicketsView.test.tsx#shows folders that failed to load as error rows` | PASS |
| AC-11 | 50 tickets listed in < 1 s | `test/main/SpecTicketsService.perf.test.ts#lists 50 tickets in under 1s`, which runs as its own sequential `npm test` step (design → Decisions); this run: under 1 s. Also checked: `spec list --all --json` through the real Electron binary with `ELECTRON_RUN_AS_NODE=1` took about 400 ms. | PASS |

**Additional end-to-end check (not an AC test):** a smoke run of the built app
(`npm run build`, `electron .` with `ELECTRON_ENABLE_LOGGING=1`) logged `[spec-cli] list --json 0
239ms` and `[spec-cli] status SPEC-0002 0 442ms` from the main process. So the path from preload
through IPC, the service and the CLI works inside the real Electron app, not only in unit tests with
a mocked `window.cockpit`.

## Goal Assessment

Goal: *"…create some new capabilities to integrate the new spec-driven process and let user look
at their tickets, see progress and have a dashboard overview of all of it. create a new spec and
design to cater for this."*

- **Integrate the spec-driven process:** the cockpit reads tickets through the workflow's own CLI
  (`--json`) and runs its commands, so gates, approvals and evidence are identical to the terminal,
  CI and Claude Code. With the requester's decision on "full control", you can create, advance,
  approve (with confirmation), reopen, block, unblock, note and toggle autopilot from the UI.
- **Look at their tickets:** the Spec Tickets view defaults to *My tickets* (owner = git user),
  with All, stage, module, search and archived filters.
- **See progress:** stage progress, the live gate result, task and AC coverage, evidence freshness,
  the documents and the log, all refreshing live.
- **Dashboard overview:** stage counts, awaiting approval, blocked, and overall task completion at
  the top of the Dashboard.
- **Spec and design:** `proposal.md` and `design.md` in this ticket, and the cockpit's own spec
  (`developer-cockpit/spec/03`–`06`), which now describes the real workflow instead of the
  outdated `<module>/specs/` model.

Gaps the requester should know about (none material to the goal):

- `spec verify` and `spec archive` are not available from the cockpit (deferred in the proposal,
  because they are long-running and need streaming). Their results do show in the detail panel.
- Loading the detail of a ticket at the *implement* stage can take about 3 s, because that gate
  runs the full policy check (git diff) in the CLI. It was observed for SPEC-0001 in the smoke run.
  No AC covers detail latency (see Follow-ups).
- The requester plans branching and testing features next. They are not part of this ticket.

## Policy Review

Reviewed against the actual SPEC-0002 changes: `developer-cockpit/**`, `specs/tools/spec.mjs`,
`specs/config.json`, `specs/README.md`. The working tree also contains unrelated, uncommitted
SPEC-0001 work. The six R10 warnings from `spec verify` concern only those SPEC-0001 Gradle and
Docker files.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No OpenAPI or Avro files are touched by this ticket. |
| P-02 | Specification before code, generated models only | N/A | No API or message contract change; the cockpit types are internal IPC types, as in the existing `src/shared/types`. |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated*` was touched. |
| P-04 | Contracts evolve compatibly | N/A | No OMS contract changes. The CLI change is additive (`--json`, `types`). Text output was checked unchanged by diffing it against a pre-change baseline captured in the scratchpad (`list`, `status`, `gate`; the only difference was the task count, which changed because tasks were ticked). The `spec ci` exit code is unchanged. There is no git history to diff, because `specs/` is untracked in this working tree. |
| P-05 | Every state change is recorded in the event log | N/A | No order state. Ticket changes are still written only by `spec.mjs`, which logs every one to `ticket.md`. |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka. |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database. |
| P-08 | Concurrency and idempotency are explicit | PASS | Actions are serialized in the store (`running`; test `#runs one action at a time`). Overlapping list loads apply only the latest response (test `#ignores an older list response`). Refresh is idempotent. Approve is idempotent in the CLI. The cross-process race on `ticket.md` is documented in design → Risks. |
| P-09 | Commands and queries stay separate | PASS | Reads (`specTickets:list/get` → `list/status --json`, which never write) are separate from actions (`specTickets:run`). |
| P-10 | State transitions go through the state machine and task pipeline | PASS | Every ticket transition goes through `spec.mjs` commands and gates; the cockpit has no code path that writes `ticket.md`. |
| P-11 | Layering and conventions | PASS | Electron-free service → `specTickets.ipc.ts` → preload/`CockpitAPI` → zustand store → views, the same as `SpecsService`/`GitService`. `SpecCli` follows `CodeGenService` (`execFile`). `MarkdownContent` was extracted from `DocumentViewer` with byte-identical overrides. |
| P-12 | Jackson 3 only | N/A | No Java. |
| P-13 | Errors and validation follow the framework specs | PASS | No HTTP API, so Problem+JSON does not apply. CLI errors are shown verbatim with their exit code. Validation and process failures reject the IPC promise and show in the store's error banner; nothing is swallowed. |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to passing tests (table above). tasks.md Notes record honestly that the T-5, T-7, T-8 and T-12 tests were not seen red first, because their code came with T-4 or was written alongside. The review-fix tests (T-20 to T-24) were all run red first. The reviewer's coverage gaps (NewTicketDialog, Unblock, Autopilot) are now tested. |
| P-15 | Observability | PASS | One `[spec-cli] <command> <id> <exit> <ms>` log line per CLI call from the main process, seen in the smoke run. No `printStackTrace` equivalents. Metrics and tracing do not apply to a local desktop tool. |
| P-16 | Security | PASS | `execFile` without a shell. Action kind, id (`^SPEC-\d{4}$`) and stage are validated in the main process, and free text starting with `--` is rejected. Document reads are limited to four fixed file names in the CLI-reported ticket folder. The WebSocket server stays outbound-only (AC-9). No secrets. |
| P-17 | Simplicity and dependencies | PASS | No runtime dependency. Four dev-only test dependencies (vitest, jsdom, @testing-library/react, @testing-library/dom), each recorded with the alternatives rejected. One rule implementation (the CLI). |
| P-18 | Modules build standalone | PASS | developer-cockpit passes `npm run typecheck` and `npm test` on its own (`spec verify`), and `npm run build` succeeds. `spec.mjs` stays zero-dependency. |
| P-19 | Documentation follows behaviour | PASS | Updated: `developer-cockpit/spec/03`–`06` (plus the `specs:changed` → `specs:tickets-changed` examples in 08 and 10) and `specs/README.md`. No `oms-knowledge-base/` page covers the cockpit. |

**Process note (not a policy row):** SPEC-0001 was on autopilot in the same working tree while this
ticket changed `specs/tools/spec.mjs` and `specs/config.json`, which the workflow forbids. The
PreToolUse hook did not block it, which suggests the hooks are not registered in
`.claude/settings.json` (see `specs/README.md` → Hooks). The changes are additive, and SPEC-0001's
verify run passed with them. Details are in tasks.md → Notes.

## Independent Review

The `spec-reviewer` agent reviewed the implementation with fresh context. First round: **NOT MET**.
Each finding and how it was resolved:

1. **[major] The result of "new ticket" was not visible** (AC-7). Confirmed, and **fixed in T-20**:
   results are tied to their ticket (`lastResultFor`), the list shows the `new` result, and a
   successful `new` selects the created ticket. New tests cover a CLI rejection and a success.
2. **[process] verification.md was unfilled.** Resolved by this document.
3. **[minor] A removed open ticket kept a stale detail.** **Fixed in T-21**: the selection is
   cleared when the ticket leaves the list; store test added.
4. **[minor] Overlapping refreshes were not sequenced.** **Fixed in T-21**: a request counter in
   `load()`; store test added.
5. **[minor] `developer-cockpit/spec/11-storyboards.md` is unrelated.** **Rejected.** That file and
   its README line are the requester's own uncommitted work, present in `git status` before this
   ticket started. SPEC-0002 did not create or change them. It does fall inside the cockpit
   evidence fingerprint, which is harmless.
6. **[minor] Ticket types were hard-coded.** **Fixed in T-23**: `types` comes from
   `list --json` (`specs/config.json`).
7. **[minor] Free text starting with `--` was misparsed by the CLI.** **Fixed in T-23**: the
   service rejects it with a clear error; test added.
8. **[minor] Text `list`, `activeTickets()` (`ci`, hooks) still crashed on broken folders.**
   **Fixed in T-24**, and the AC-10 test now runs text `list` and `ci`.
9. **[minor] Reopen was not offered for blocked tickets.** **Fixed in T-22**; test added, which also
   covers Unblock and Autopilot.
10. **[minor] design.md contradicted itself on text validation.** **Fixed**: the text was
    corrected, and the post-review decisions were appended.

Second round (re-review of the fixes): **MET**. Findings 1, 3, 4 and 6 to 10 are confirmed resolved,
nothing new broke, and the reviewer accepted the explanation for finding 5. It re-ran `npm test`
(38 passing) and typecheck. New minor findings:

1. **A module name such as `--x` in "new" would have created a ticket with no modules.** Confirmed.
   **Fixed**: modules must match `^\w[\w.-]*$` and `type` must not start with `--`. The test
   `#text starting with -- is rejected before the CLI` was extended (red first: the CLI accepted it
   with exit 0), then went green. `spec verify` was re-run afterwards.
2. **The vanished-ticket check in `refresh()` runs even when its own `load()` was overtaken.**
   **Not changed.** The reviewer could not construct a realistic sequence that clears a valid
   selection: the newest load has always applied, or will apply, its list. Recorded as speculative.
3. **`assertNoFlag` trims, so `'  --why'` is rejected even though the CLI would accept it.**
   **Not changed**, on purpose. It is stricter than needed, not wrong, and a leading-space flag is
   more likely a mistake than intended text.

## Automated Evidence

`evidence/last-run.json` from the latest `node specs/tools/spec.mjs verify SPEC-0002`:

- **Result:** `pass`, modules `developer-cockpit`, with a content fingerprint of that module.
- **Policy check:** no errors. Six R10 warnings, all for SPEC-0001 files in the shared working
  tree (`build.gradle`, `settings.gradle`, `docker-compose.yml`, `oms-contracts/build.gradle`,
  `oms-exchange-simulator/{build,settings}.gradle`).
- **`npm run typecheck`:** exit 0 (`evidence/developer-cockpit-1.log`).
- **`npm test`:** exit 0 (`evidence/developer-cockpit-2.log`): 37 tests in 12 files, then the
  performance test in its own run. None failed or were skipped.

## Follow-ups

- **Register the spec hooks.** Copy `specs/tools/settings-hooks.json` into
  `.claude/settings.json`; this session's experience suggests they are not active (see the process
  note).
- **Detail latency for implement-stage tickets** (about 3 s, from the policy check in
  `status --json`). Options: cache the policy check per git state, or load the gate after the rest
  of the detail.
- **`spec verify` / `spec archive` from the cockpit**, with streamed output and cancellation
  (deferred by the proposal).
- **Pre-existing, not caused by this ticket:** the Specs Editor loads Monaco from a CDN, which the
  app's CSP blocks (`Refused to load … monaco-editor … loader.js`, plus an uncaught promise
  rejection), seen in the smoke run. Separately, the glob strings in `WatcherService`'s `ignored`
  option probably have no effect, because chokidar 4 dropped glob support. Not verified here.
- **Planned by the requester:** branching and testing capabilities in the cockpit.

## Verdict

Verdict: GOAL MET
