# Tasks — SPEC-0037: Filter the ticket table from KPI tiles

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

- [x] **T-1** Extend the Dashboard test "the Active, In progress and Awaiting approval tiles …" to assert that there is no filter chip after *Active tickets* (AC-1, AC-2, AC-4)
  - files: developer-cockpit/test/renderer/Dashboard.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/Dashboard.test.tsx` passes
- [x] **T-2** Add the Dashboard test "clicking In progress or Awaiting approval again removes the filter" (AC-3)
  - files: developer-cockpit/test/renderer/Dashboard.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/Dashboard.test.tsx -t "again removes the filter"` passes
- [x] **T-3** Add the Dashboard test "the stage select's cross-stage views list the same tickets as their tiles", which also checks the chip label and dot colour (AC-5)
  - files: developer-cockpit/test/renderer/Dashboard.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/Dashboard.test.tsx test/renderer/StageDonut.test.tsx` passes
- [x] **T-4** Add `test/vitest-config.test.ts` (stubbed `os.cpus()` for 1, 4, 8, 12 and 32 CPUs gives maxWorkers 2, 2, 4, 6, 6, and minWorkers is 1) (AC-6)
  - files: developer-cockpit/test/vitest-config.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/vitest-config.test.ts` passes
- [x] **T-5** Check `developer-cockpit/spec/03-features.md` (KPI tiles row, Filters) against AC-1 to AC-5, and correct it only if it disagrees (AC-1, AC-2, AC-3, AC-4, AC-5)
  - files: developer-cockpit/spec/03-features.md
  - verify: every tile behaviour in AC-1 to AC-5 is stated in the KPI tiles row or the Filters paragraph (observed and recorded in verification.md)
- [x] **T-7** Tighten the tests after independent review: AC-5's test selects *All tickets* first, the AC-4 test clicks *Blocked* a second time, and the AC-1 test asserts the three *My tickets* rows before the click (AC-1, AC-4, AC-5)
  - files: developer-cockpit/test/renderer/Dashboard.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/Dashboard.test.tsx` passes
- [x] **T-6** Run spec verify (AC-7)
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0037` exits 0

## Notes

- This is verification of committed behaviour (`ad7c3d0`). A new gap test that passes at once is
  expected and is recorded as such. A failing one means a defect: fix it test-first, and record
  the fix in design.md.
- T-7 was added after the independent review reopened the ticket at verify (AC-5 had an unstated
  precondition; AC-4 and AC-1 were weakly asserted). T-6 was un-ticked so verify runs again on the
  final tests.
