# Tasks — SPEC-0004: Edit spec ticket documents in the cockpit

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

All `npx vitest` commands run from `developer-cockpit/`. Main-process tests use the temp workspace
from `test/fixtures/workspace.ts` and never touch the repository's own `specs/`.

### CLI (autopilot off for T-2, see Notes)

- [x] **T-1** Record the pre-change CLI output snapshots and write the failing draft-gate test (AC-8)
  - files: developer-cockpit/test/main/spec-cli-draft.test.ts, developer-cockpit/test/main/__snapshots__/
  - Fixture: tickets at proposal (gate fails), design (gate passes), plan and implement (2/3 tasks)
    in a temp workspace. "outputs without --draft match the pre-change snapshots" covers stdout and
    exit code of `gate`, `gate --json`, `status`, `status --json`, `list`, `list --json` and
    `advance`, using `toMatchFileSnapshot`. It runs once **before** spec.mjs changes, so the
    snapshots hold the old behaviour. The draft tests ("gate --draft equals gate after write and
    writes nothing", "rejects unknown --draft file") fail at this point.
  - verify: `npx vitest run test/main/spec-cli-draft.test.ts -t "pre-change"` passes and writes the snapshots; the two draft tests fail
- [x] **T-2** Add `--draft <file>` (stdin) to `spec gate` (AC-8, AC-3)
  - files: specs/tools/spec.mjs
  - `DRAFT` override in `doc()`, `stdinText()` (factored out of `stdinJson()`), async `cmdGate`
    validating the file name against `DOCS`, `main()` awaits it, HELP line.
  - verify: `npx vitest run test/main/spec-cli-draft.test.ts` passes without updating any snapshot (snapshot files byte-identical to T-1)

### Main process

- [x] **T-3** Shared editable-document rule (AC-1, AC-4)
  - files: developer-cockpit/src/shared/types/specTickets.ts, developer-cockpit/src/main/services/SpecTicketsService.ts, developer-cockpit/test/shared/editableDocument.test.ts
  - `STAGE_DOCUMENT`, `DOCUMENT_FILES` (moved from the service), `editableDocument()`,
    `editableStage()`, `SpecSaveResult`. Test first.
  - verify: `npx vitest run test/shared/editableDocument.test.ts` passes
- [x] **T-4** `SpecCli` stdin input (AC-3)
  - files: developer-cockpit/src/main/services/SpecCli.ts
  - `run(args, input?)` / `json(args, input?)`; stdin is closed when there is no input.
  - verify: `npx vitest run test/main/SpecTicketsService.test.ts test/main/SpecTicketsService.actions.test.ts` still passes
- [x] **T-5** `saveDocument` with stage/path checks and conflict detection (AC-2, AC-4, AC-6)
  - files: developer-cockpit/src/main/services/SpecTicketsService.ts, developer-cockpit/test/main/SpecTicketsService.documents.test.ts
  - Tests first: "saveDocument writes exactly the edited text", "saveDocument rejects ticket.md,
    evidence, traversal, other-stage, archived and done documents", "save and tick report a
    conflict when the file changed on disk" (save part), "overwrite with force". Log writes and
    refusals.
  - verify: `npx vitest run test/main/SpecTicketsService.documents.test.ts -t "saveDocument|conflict|overwrite"` passes
- [x] **T-6** `draftGate` through the CLI (AC-3)
  - files: developer-cockpit/src/main/services/SpecTicketsService.ts, developer-cockpit/test/main/SpecTicketsService.documents.test.ts
  - Test first: "draftGate equals gate after writing the same text and leaves the file unchanged"
    at the proposal, design, plan and verify stages.
  - verify: `npx vitest run test/main/SpecTicketsService.documents.test.ts -t "draftGate"` passes
- [x] **T-7** `toggleTask` (AC-5, AC-6)
  - files: developer-cockpit/src/main/services/SpecTicketsService.ts, developer-cockpit/test/main/SpecTicketsService.documents.test.ts
  - Tests first: "toggleTask flips only that marker", "toggleTask is refused outside implement",
    "toggleTask ignores the commented template example"; extend the conflict test to tick.
  - verify: `npx vitest run test/main/SpecTicketsService.documents.test.ts` passes
- [x] **T-8** Wire the IPC channels, preload and API types (AC-2, AC-3, AC-5)
  - files: developer-cockpit/src/main/ipc/specTickets.ipc.ts, developer-cockpit/src/main/preload.ts, developer-cockpit/src/shared/types/ipc.ts, developer-cockpit/test/renderer/ticket-fixtures.ts, developer-cockpit/test/main/websocket-no-actions.test.ts
  - `specTickets:saveDocument|draftGate|toggleTask`; `mockCockpit()` gets the three mocks; the
    WebSocket test also asserts the new operations are not reachable there.
  - verify: `npm run typecheck` passes and `npx vitest run test/main/websocket-no-actions.test.ts` passes

### Renderer

- [x] **T-9** `docEditor` store: edit, debounced draft gate, save, conflict, reload, sync (AC-2, AC-3, AC-6)
  - files: developer-cockpit/src/renderer/stores/docEditor.ts, developer-cockpit/test/renderer/docEditor-store.test.ts
  - Tests first: "debounced draft gate result arrives within 2 s and is shown as draft",
    "reload drops edits and takes disk content", "syncFromDisk follows the file when not dirty",
    plus save success/conflict and the stale-result guard.
  - verify: `npx vitest run test/renderer/docEditor-store.test.ts` passes
- [x] **T-10** `DocumentEditor` component (AC-2, AC-6)
  - files: developer-cockpit/src/renderer/views/spec-tickets/DocumentEditor.tsx, developer-cockpit/test/renderer/DocumentEditor.test.tsx
  - Monaco mocked as a textarea. Tests first: "save via button and Ctrl+S clears Modified and
    refreshes the gate", conflict banner Reload/Overwrite.
  - verify: `npx vitest run test/renderer/DocumentEditor.test.tsx` passes
- [x] **T-11** Edit mode, draft gate label and task checkboxes in `TicketDetail` (AC-1, AC-3, AC-5, AC-6)
  - files: developer-cockpit/src/renderer/views/spec-tickets/TicketDetail.tsx, developer-cockpit/src/renderer/views/spec-tickets/GateResult.tsx, developer-cockpit/test/renderer/TicketDetail.edit.test.tsx
  - Tests first: "offers Edit only on the current stage document", "offers no Edit for archived or
    done tickets", "gate panel labels draft results", "task checkboxes only at implement".
  - verify: `npx vitest run test/renderer/TicketDetail.edit.test.tsx test/renderer/TicketDetail.test.tsx` passes
- [x] **T-12** Unsaved-edit guards and disabled Advance/Approve (AC-7)
  - files: developer-cockpit/src/renderer/stores/specTickets.ts, developer-cockpit/src/renderer/stores/navigation.ts, developer-cockpit/src/renderer/views/spec-tickets/TicketActions.tsx, developer-cockpit/test/renderer/DocumentEditor.guards.test.tsx
  - Test first: "selecting another ticket, tab or view asks to confirm; cancel keeps edits and
    selection", "Advance and Approve are disabled while dirty".
  - verify: `npx vitest run test/renderer/DocumentEditor.guards.test.tsx test/renderer/TicketActions.test.tsx test/renderer/specTickets-store.test.ts` passes

### Docs and verification

- [x] **T-13** Update cockpit spec pages and specs/README.md
  - files: developer-cockpit/spec/03-features.md, developer-cockpit/spec/04-backend-services.md, developer-cockpit/spec/05-data-model.md, specs/README.md
  - verify: the four pages describe editing, draft gate, ticking, conflicts/guards and `--draft`, and `03-features.md` no longer states that stage documents are read-only
- [x] **T-14** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0004` exits 0

### Review fixes (added after the independent review, see Notes)

- [x] **T-15** Load Monaco from the bundle instead of the CDN (AC-2, AC-3)
  - files: developer-cockpit/package.json, developer-cockpit/package-lock.json, developer-cockpit/src/renderer/lib/monaco.ts, developer-cockpit/src/renderer/App.tsx, developer-cockpit/src/renderer/views/spec-tickets/DocumentEditor.tsx, developer-cockpit/src/renderer/views/specs-editor/SpecEditor.tsx, developer-cockpit/vitest.config.ts, developer-cockpit/test/setup.ts, developer-cockpit/test/renderer/monaco-loader.test.ts
  - Test first: "configures the loader with the bundled monaco and same-origin workers".
  - verify: `npx vitest run test/renderer/monaco-loader.test.ts` passes, `npm run build` succeeds, and in the running app (built, real CSP) opening Edit on a ticket renders a `.monaco-editor` element with no CSP violation in the console
- [x] **T-16** Advance-disabled test without the awaiting proxy; measured 2 s draft-gate bound (AC-7, AC-3)
  - files: developer-cockpit/test/renderer/DocumentEditor.guards.test.tsx, developer-cockpit/test/main/SpecTicketsService.documents.test.ts
  - Non-awaiting ticket: Advance enabled before the edit, disabled after. Real CLI: debounce + `draftGate` < 2000 ms.
  - verify: `npx vitest run test/renderer/DocumentEditor.guards.test.tsx test/main/SpecTicketsService.documents.test.ts` passes
- [x] **T-17** Store and detail robustness: clear stale draft result/error on edit, close editor when the editable document changes, Reopen hint (AC-1, AC-3, AC-7)
  - files: developer-cockpit/src/renderer/stores/docEditor.ts, developer-cockpit/src/renderer/views/spec-tickets/TicketDetail.tsx, developer-cockpit/test/renderer/docEditor-store.test.ts, developer-cockpit/test/renderer/TicketDetail.edit.test.tsx
  - Tests first: "a new edit clears the previous draft result and error", "closes the editor when the stage moves on", "non-editable tabs show the Reopen hint".
  - verify: `npx vitest run test/renderer/docEditor-store.test.ts test/renderer/TicketDetail.edit.test.tsx` passes
- [x] **T-18** Main-process hardening: ignore stdin EPIPE, refuse saving a missing document (AC-4)
  - files: developer-cockpit/src/main/services/SpecCli.ts, developer-cockpit/src/main/services/SpecTicketsService.ts, developer-cockpit/test/main/SpecTicketsService.documents.test.ts
  - Test first: "saveDocument refuses a missing document, even with force".
  - verify: `npx vitest run test/main/SpecTicketsService.documents.test.ts` passes
- [x] **T-19** Docs for the review fixes
  - files: developer-cockpit/spec/03-features.md, developer-cockpit/spec/04-backend-services.md
  - verify: 03-features §1 mentions the Reopen hint, closing on stage change and the tick-conflict behaviour; 04 mentions bundled Monaco and the missing-file refusal
- [x] **T-20** Run spec verify again
  - verify: `node specs/tools/spec.mjs verify SPEC-0004` exits 0
- [x] **T-21** Second review: FilePreview configures Monaco itself; route TS/CSS/HTML workers (AC-2)
  - files: developer-cockpit/src/renderer/lib/monaco.ts, developer-cockpit/src/renderer/views/file-explorer/FilePreview.tsx, developer-cockpit/test/setup.ts, developer-cockpit/test/renderer/monaco-loader.test.ts
  - Tests first: worker routing by label; "every component that renders a Monaco editor configures the loader first".
  - verify: `npx vitest run test/renderer/monaco-loader.test.ts` passes, `npm run build` succeeds, runtime check as in T-15 passes, and `node specs/tools/spec.mjs verify SPEC-0004` exits 0

## Notes

- T-2 and the `specs/README.md` part of T-13 edit `specs/`, and T-2 is under `specs/tools/`, which
  the PreToolUse hook blocks while any ticket is on autopilot. As approved with the proposal:
  `spec autopilot SPEC-0004 off` before T-2, `on` again right after it. Nothing else under
  `specs/tools|policies|templates` or `specs/config.json` changes.
- T-1 must run before T-2 so the snapshots capture the unmodified CLI.
- T-15 … T-20 were added after the independent review at verify (ticket reopened at implement).
  T-15 is blocking: Monaco could not load under the renderer CSP. The others are the reviewer's
  minor findings that are cheap to fix. Not done: a snapshot of an `advance` that moves the
  stage (exit 0), since one recorded now would show the changed CLI rather than the old one. The
  existing snapshots cover the passing-gate path (`advance-0002`: PASS, exit 3); `specs/` is
  untracked, so there is no committed baseline to diff against.
- T-21 was added at verify after the second review; code changed, so `spec verify` was re-run.
