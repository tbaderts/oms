# Verification — SPEC-0004: Edit spec ticket documents in the cockpit

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` (`evidence/developer-cockpit-2.log`:
20 files / 77 tests + perf test, all ✓). Test files are under `developer-cockpit/test/`. Because
every automated test replaces Monaco with a textarea, the real editor was also checked in the built
app (see *Runtime check* below).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Only the current stage's document offers Edit; none for archived/done | `shared/editableDocument.test.ts` (3 tests); `renderer/TicketDetail.edit.test.tsx` — "offers Edit only on the current stage document" (six stage/blocked cases → exactly one `Edit <file>`), "offers no Edit for archived or done tickets", "non-editable tabs show the Reopen hint", "closes the editor when the stage moves on" | PASS |
| AC-2 | Save writes exactly the edited text, clears Modified, gate shows saved result | `main/SpecTicketsService.documents.test.ts` — "saveDocument writes exactly the edited text" (CRLF, no trailing newline, byte-equal; gate of the saved file); `renderer/DocumentEditor.test.tsx` — "save via button and Ctrl+S clears Modified and refreshes the gate"; `renderer/monaco-loader.test.ts` (bundled Monaco, every Editor user configures the loader); runtime check: Monaco renders the real document in the built app | PASS |
| AC-3 | Draft gate within 2 s equals gate after write; file unchanged | `main/SpecTicketsService.documents.test.ts` — "draftGate equals gate after writing the same text and leaves the file unchanged" (proposal, design, blocked-from-plan, verify), "draft gate result is available within 2 s of the last keystroke" (real CLI + real debounce constant); `renderer/docEditor-store.test.ts` — debounce, stale-result guard, "a new edit clears the previous draft result and error"; `renderer/TicketDetail.edit.test.tsx` — "gate panel labels draft results"; `main/spec-cli-draft.test.ts` | PASS |
| AC-4 | Main process rejects ticket.md, evidence, traversal, other-stage, archived, done | `main/SpecTicketsService.documents.test.ts` — "saveDocument rejects ticket.md, evidence, traversal, other-stage, archived and done documents" (10 refusals + oversize + non-text; whole `specs/` tree byte-identical afterwards), "saveDocument refuses a missing document, even with force" | PASS |
| AC-5 | Tick changes only that marker; progress ±1; refused outside implement | `main/SpecTicketsService.documents.test.ts` — "toggleTask flips only that marker" (one-character diff on CRLF, 1→2→1, original bytes restored), "toggleTask is refused outside implement", "toggleTask ignores the commented template example"; `renderer/TicketDetail.edit.test.tsx` — "task checkboxes only at implement" | PASS |
| AC-6 | Conflict on save/tick → no write, reload or overwrite; clean editor follows disk within 2 s | `main/SpecTicketsService.documents.test.ts` — "save and tick report a conflict when the file changed on disk", "overwrite with force"; `renderer/docEditor-store.test.ts` — conflicting save, "reload drops edits and takes disk content", "syncFromDisk follows the file when not dirty"; `renderer/DocumentEditor.test.tsx` — "conflict banner offers reload and overwrite"; `renderer/TicketDetail.edit.test.tsx` — "a clean editor follows the document on disk"; disk → refresh within 2 s: `main/WatcherService.test.ts` + `renderer/specTickets-store.test.ts`. A tick conflict offers no Overwrite (a tick has no text of its own; the list reloads and the user ticks again), as decided in design.md. | PASS |
| AC-7 | Confirm before leaving with unsaved edits; Advance/Approve disabled | `renderer/DocumentEditor.guards.test.tsx` — "selecting another ticket, tab or view asks to confirm; cancel keeps edits and selection", "Advance is disabled while dirty on a ticket that is not awaiting approval" (enabled → disabled → enabled), "Advance and Approve are disabled while dirty"; `renderer/TicketDetail.edit.test.tsx` — "asks before closing an editor with unsaved edits when the stage moves on" | PASS |
| AC-8 | `gate --draft` equals gate after write, writes nothing; other output byte-identical | `main/spec-cli-draft.test.ts` — "gate --draft equals gate after write and writes nothing", "rejects unknown --draft file", "outputs without --draft match the pre-change snapshots" (14 snapshots of list/status/gate/advance text, JSON and exit codes, recorded against the unmodified CLI in T-1 (mtimes 13:21:52–13:22:08, `spec.mjs` changed at 13:23:01); SHA-1 of all 14 unchanged after T-2) | PASS |

**Runtime check (T-15, T-21):** the built app (`dist/`, real CSP, `file://`) was launched with
`--remote-debugging-port` and driven over CDP: Spec Tickets → SPEC-0004 → Edit. Before the fix the
console showed `Refused to load the script 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs/loader.js'`
and the editor stayed on "Loading…". After it, `.monaco-editor` rendered 28 lines of the real
document with no console errors and no CDN script. The second reviewer reproduced this
independently.

## Goal Assessment

The Goal asks for more spec-driven functionality in the cockpit, specifically a ticket document
editor: edit proposal/design/tasks/verification.md in the cockpit, a live gate check while typing,
and ticking tasks. All three are delivered in the Spec Tickets view and work in the running app (not
only in tests). The check while typing uses the same CLI rules as `spec advance`, so the
editor shows what the gate will say.

Deliberate limits, agreed in the proposal: only the current stage's document is editable (others
show a "use Reopen" hint), `ticket.md` stays CLI-only, archived/done tickets are read-only.

Side effect worth knowing: the Monaco fix also repairs the existing Specs Editor and File Explorer
preview, which could never load Monaco under the CSP. The Specs Editor's empty file list (stale
`oms-core/src/main/{openapi,avro}` paths) is a separate, out-of-scope bug.

No material gap. Not guarding window close with unsaved edits is a recorded follow-up.

## Policy Review

Reviewed against the SPEC-0004 files (the branch also carries unrelated uncommitted work from
earlier tickets; the R10 warnings in the policy check come from that work: root/oms-contracts/
oms-exchange-simulator Gradle files and docker-compose.yml, none touched here).

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No OpenAPI/Avro involved; no contract folder created. |
| P-02 | Specification before code, generated models only | N/A | No API or message change. |
| P-03 | Never edit generated code | PASS | No `build/generated*` or `dist/` source edited (dist was only rebuilt). |
| P-04 | Contracts evolve compatibly | PASS | No OMS contract change; `--draft` is additive and CLI output without it is snapshot-identical (AC-8). |
| P-05 | Every state change is recorded in the event log | N/A | No order state; ticket state still changes only through the CLI. |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka. |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database. |
| P-08 | Concurrency and idempotency are explicit | PASS | Base-content conflict check on every save and tick; tick sets a target value. Read-then-write without a lock leaves a tiny window, acceptable for a single-user desktop tool. |
| P-09 | Commands and queries stay separate | PASS | `list`/`get`/`draftGate` never write; writes are `saveDocument`/`toggleTask`. |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order transitions; stage transitions remain CLI-only. |
| P-11 | Layering and conventions | PASS | IPC handler → `SpecTicketsService` → CLI/fs; `docEditor` store and `DocumentEditor` mirror `stores/specs.ts`/`SpecEditor.tsx`. |
| P-12 | Jackson 3 only | N/A | TypeScript/Node only. |
| P-13 | Errors and validation follow the framework specs | PASS | No HTTP API; IPC input validated in main, refusals thrown with readable messages via `refuse()`, errors shown in the UI, nothing swallowed (stdin EPIPE is ignored on purpose; the CLI's exit code decides). |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC traced above; tests were run red before implementing, except T-3 (test and code written in one step). Monaco itself is covered by the recorded runtime check, not an automated test. |
| P-15 | Observability | PASS | `[spec-tickets] saved/conflict/refused` log lines with ticket id and file; CLI calls keep the `[spec-cli]` log. |
| P-16 | Security | PASS | Document names not paths, stage enforcement, `specs/changes/` prefix check, 1 MB limit, task id pattern, no document creation; writes not reachable over WebSocket (`websocket-no-actions.test.ts`). CSP unchanged (Monaco now bundled instead of loosening it). |
| P-17 | Simplicity and dependencies | PASS | One dependency change, recorded in design.md Alternatives & Decisions: `monaco-editor` (already installed as a peer at 0.55.1) became a direct dependency. CLI change limited to `doc()` override + `--draft`. |
| P-18 | Modules build standalone | PASS | `npm run typecheck`, `npm test` (evidence logs 1 and 2) and `npm run build` pass in developer-cockpit. |
| P-19 | Documentation follows behaviour | PASS | `developer-cockpit/spec/03-features.md` §1, `04-backend-services.md` §2.3, `05-data-model.md` §3, `specs/README.md` updated. No `oms-knowledge-base/` change needed (no OMS behaviour change). |

## Independent Review

**Round 1 (spec-reviewer): NOT MET.** Findings and resolution:

1. *Blocking* — Monaco loaded from the CDN, which the CSP blocks; the editor could not load in the
   app. **Confirmed at runtime and fixed** (ticket reopened at implement, T-15): bundled Monaco via
   `lib/monaco.ts`; root cause also included App.tsx's idle `loader.init()` preload, now an import
   of `lib/monaco`. Verified in the built app.
2. Advance-disabled test passed only by proxy (`awaiting` ticket). **Fixed** (T-16, new test on a
   non-awaiting ticket).
3. AC-3's 2 s bound not measured. **Fixed** (T-16, real-CLI timing test).
4. No "Reopen" hint on non-editable tabs. **Fixed** (T-17).
5. Stale draft result/error after further typing. **Fixed** (T-17).
6. No Overwrite for tick conflicts. **Kept by decision**; documented in design.md and 03-features.md.
7. Editor stayed open after the stage changed elsewhere. **Fixed** (T-17; closes, asking first if dirty).
8. Snapshot timing/coverage. **Not changed**: a new snapshot would record the modified CLI. The
   existing mtimes are consistent with recording before the change (confirmed by round 2), and the
   passing-gate path is covered (`advance-0002`).
9. stdin EPIPE could surface as an unhandled stream error. **Fixed** (T-18).
10. `force` could create a missing document. **Fixed** (T-18).
11. verification.md unfilled. **Done** (this document).

**Round 2 (spec-reviewer, after T-15…T-20): MET**, reproduced the runtime check independently.
Minor findings:

1. FilePreview rendered Monaco without configuring the loader (race: an early preview would lock
   the loader onto the CDN for the session). **Fixed** (T-21) plus a test that every `Editor` user
   imports `lib/monaco`.
2. TS/CSS/HTML language services got the generic worker. **Fixed** (T-21).
3. Design and T-15 said `lib/monaco` is imported in `main.tsx`. **Corrected** in design.md/tasks.md.
4. P-17 rows said "no new dependency". **Corrected** in design.md and here.
5. tasks.md note referred to a non-existent baseline commit. **Corrected**.
6. While typing, the gate panel briefly shows the saved result until the draft result arrives
   (≥ 500 ms). **Follow-up** (UX polish, no AC impact).
7. After cancelling the close on a stage change, the open document can no longer be saved and no
   banner says so (a save shows main's refusal). Intended (keeps the text for copying).
   **Follow-up** for a banner.

After T-21 the code changed, so `spec verify` and the runtime check were re-run (both pass).

## Automated Evidence

`spec verify SPEC-0004` at 2026-10-26T13:04Z: result **pass**, modules `developer-cockpit`.

| Command | Exit | Log |
|---|---|---|
| policy check (changes since main) | PASS (0 errors, 6 R10 warnings from unrelated branch work) | — |
| `npm run typecheck` | 0 (6 s) | `evidence/developer-cockpit-1.log` |
| `npm test` | 0 (25 s; 77 tests + 1 perf test) | `evidence/developer-cockpit-2.log` |

## Follow-ups

- Guard closing the window (Electron `beforeunload`) while a document has unsaved edits.
- Show "checking…" immediately while typing, and a read-only banner when the stage moved on under
  an editor whose close was cancelled.
- Fix the Specs Editor / Domain Model / Code Generator paths that still point at
  `oms-core/src/main/{openapi,avro}` (separate fix ticket).

## Verdict

Verdict: GOAL MET
