# Tasks — SPEC-0040: Withdraw a spec ticket that is no longer needed

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

- [x] **T-1** Write `developer-cockpit/test/main/spec-cli-withdraw.test.ts` (`withdraws a ticket at any stage before done`, `refuses without a reason, for done, unknown or archived tickets`, `a withdrawn ticket leaves the active views and ci`, `the pre-tool hook denies withdraw like approve`) red against the fixture workspace (AC-1, AC-2, AC-3, AC-4)
  - files: developer-cockpit/test/main/spec-cli-withdraw.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/spec-cli-withdraw.test.ts` fails because `withdraw` is an unknown command
- [x] **T-2** Cockpit service: `SpecTicketsService.actions.test.ts` › `withdraw requires a reason and runs spec withdraw` red, then add `withdrawn` to `SpecTicketStatus`, `withdrawnFrom`/`withdrawnReason` to the summary and mapping, and the `withdraw` action kind (AC-5)
  - files: developer-cockpit/test/main/SpecTicketsService.actions.test.ts, developer-cockpit/src/shared/types/specTickets.ts, developer-cockpit/src/main/services/SpecTicketsService.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/SpecTicketsService.actions.test.ts` passes and `npm run typecheck` passes
- [x] **T-3** Cockpit UI: `TicketActions.test.tsx` › `Withdraw… asks for a reason and runs the action; not offered when done or archived`, `TicketDetail.test.tsx` › `a withdrawn ticket shows the withdrawn badge and reason`, `spec-tickets-kpis.test.ts` › `withdrawn tickets are not counted` red, then the Withdraw… prompt, the badge in `StageProgress` and the reason line in `TicketDetail` (AC-5)
  - files: developer-cockpit/test/renderer/TicketActions.test.tsx, developer-cockpit/test/renderer/TicketDetail.test.tsx, developer-cockpit/test/renderer/spec-tickets-kpis.test.ts, developer-cockpit/src/renderer/views/spec-tickets/TicketActions.tsx, developer-cockpit/src/renderer/views/spec-tickets/StageProgress.tsx, developer-cockpit/src/renderer/views/spec-tickets/TicketDetail.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/TicketActions.test.tsx test/renderer/TicketDetail.test.tsx test/renderer/spec-tickets-kpis.test.ts` passes
- [x] **T-4** Docs: `specs/README.md` (withdrawn state, `spec withdraw`, human-only, archived immediately) and `developer-cockpit/spec/03-features.md` (Withdraw… action, withdrawn badge) (AC-1, AC-5)
  - files: specs/README.md, developer-cockpit/spec/03-features.md
  - verify: `grep -n "spec withdraw" specs/README.md` and `grep -n "Withdraw" developer-cockpit/spec/03-features.md` show the new text
- [x] **T-5** `spec.mjs`: `cmdWithdraw`, the shared `moveToArchive`, `list`/`status` output, the hook rule, `HELP` (AC-1, AC-2, AC-3, AC-4). The PreToolUse hook blocks edits to `specs/tools/` while any ticket is on autopilot; the run blocks here for the requester's decision (design.md)
  - files: specs/tools/spec.mjs
  - verify: `cd developer-cockpit && npx vitest run test/main/spec-cli-withdraw.test.ts` passes
- [x] **T-6** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0040` exits 0
- [x] **T-7** Review fixes, test-first: `stageIndex` uses `withdrawnFrom`, the In-progress view excludes archived tickets, the store shows archived tickets after a withdraw so the ticket stays open, `NEXT.withdrawn`, `cmdWithdraw` refuses a blank reason, an already-withdrawn ticket and an existing archive target before writing anything, AC-2 refusal messages checked, spec-run skill rule (AC-2, AC-3, AC-5)
  - files: developer-cockpit/src/renderer/lib/spec-tickets.ts, developer-cockpit/src/renderer/stores/specTickets.ts, developer-cockpit/test/renderer/spec-tickets-lib.test.ts, developer-cockpit/test/renderer/specTickets-store.test.ts, developer-cockpit/test/main/spec-cli-withdraw.test.ts, specs/tools/spec.mjs, .claude/skills/spec-run/SKILL.md
  - verify: `cd developer-cockpit && npx vitest run test/main/spec-cli-withdraw.test.ts test/renderer/spec-tickets-lib.test.ts test/renderer/specTickets-store.test.ts` passes
- [x] **T-8** Run spec verify again
  - verify: `node specs/tools/spec.mjs verify SPEC-0040` exits 0

## Notes

<!-- Optional: sequencing constraints, tasks added during implementation and why. -->

- Implementation notes:
  - T-1: the refusal test passed before T-5 because an unknown command also exits non-zero; with the
    command in place it guards the real refusals.
  - T-3: the design said the dialog already disables confirm for an empty Block reason; it does not.
    Withdraw… disables its confirm until a reason is entered; Block… is unchanged.
  - T-5 ran with autopilot off for SPEC-0040, by the requester's decision (note-free unblock after
    switching autopilot off, 2026-11-01 07:06), because the PreToolUse hook guards `specs/tools/`
    while any ticket is on autopilot.
  - T-6: `SpecTicketsService.test.ts` compares the whole mapped summary; it gained the two new
    fields (empty for a normal ticket).
