# Tasks — SPEC-0005: Fix contract paths and merge into Contracts view

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

All `npx vitest` commands run from `developer-cockpit/`. Each task writes its test first and sees it
fail before the code change.

- [x] **T-1** Default contract paths and legacy migration in ConfigService (AC-1, AC-2)
  - files: developer-cockpit/src/shared/types/config.ts, developer-cockpit/src/main/services/ConfigService.ts, developer-cockpit/test/main/ConfigService.test.ts
  - Injectable `configDir`; `LEGACY_SPECS_PATHS`; exported `migrateConfig`; `load()` saves once when migrated.
  - verify: `npx vitest run test/main/ConfigService.test.ts` passes
- [x] **T-2** Discovery, Domain Model entities and save guard on oms-contracts (AC-1, AC-4, AC-7)
  - files: developer-cockpit/src/main/services/SpecsService.ts, developer-cockpit/test/main/SpecsService.contracts.test.ts
  - Tests: default-path discovery with an `oms-core` decoy; entities from the repo's `oms-contracts`; save guard (prefix sibling, other dir, outside workspace, extension).
  - verify: `npx vitest run test/main/SpecsService.contracts.test.ts` passes
- [x] **T-3** Specs IPC follows saved config without restart (AC-3)
  - files: developer-cockpit/src/main/ipc/specs.ipc.ts, developer-cockpit/test/main/specs.ipc.test.ts
  - verify: `npx vitest run test/main/specs.ipc.test.ts` passes
- [x] **T-4** Code generation tasks for oms-contracts and oms-core, Windows-safe runner (AC-5)
  - files: developer-cockpit/src/shared/types/specs.ts, developer-cockpit/src/main/services/CodeGenService.ts, developer-cockpit/test/main/CodeGenService.test.ts, developer-cockpit/test/renderer/specs-store.test.ts
  - verify: `npx vitest run test/main/CodeGenService.test.ts test/renderer/specs-store.test.ts` passes
- [x] **T-5** Contracts view replaces Specs Editor, Domain Model and Code Generator in navigation (AC-6)
  - files: developer-cockpit/src/renderer/stores/navigation.ts, developer-cockpit/src/renderer/components/layout/ContentArea.tsx, developer-cockpit/src/renderer/views/contracts/ContractsView.tsx, developer-cockpit/src/renderer/views/dashboard/DashboardView.tsx, developer-cockpit/test/renderer/ContractsView.test.tsx
  - verify: `npx vitest run test/renderer/ContractsView.test.tsx` passes and `npm run typecheck` passes (no stale view ids)
- [x] **T-6** Update cockpit spec pages
  - files: developer-cockpit/spec/02-information-architecture.md, developer-cockpit/spec/03-features.md, developer-cockpit/spec/04-backend-services.md, developer-cockpit/spec/05-data-model.md, developer-cockpit/spec/11-storyboards.md
  - verify: `grep -n "Specs Editor" developer-cockpit/spec/*.md` returns only historical mentions explained as "now Contracts → Editor", and 03-features.md has a Contracts section
- [x] **T-7** Runtime check in the built app (AC-1, AC-4, AC-5, AC-6)
  - verify: built app over CDP — Contracts → Editor lists the oms-contracts files and opens one in Monaco; Domain Model lists entities; Code Generation → API interfaces runs and reports success (output recorded in verification.md)
- [x] **T-8** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0005` exits 0
- [x] **T-9** Review findings: Run all stops at a failure; partial Gradle output kept on kill/timeout; save also requires the workspace; no duplicate view headings; unused icons; doc fix (AC-5, AC-6, AC-7)
  - files: developer-cockpit/src/renderer/stores/specs.ts, developer-cockpit/src/main/services/CodeGenService.ts, developer-cockpit/src/main/services/SpecsService.ts, developer-cockpit/src/renderer/views/domain-model/DomainModelView.tsx, developer-cockpit/src/renderer/views/code-generator/CodeGeneratorView.tsx, developer-cockpit/src/renderer/components/layout/Sidebar.tsx, developer-cockpit/spec/04-backend-services.md, tests specs-store, CodeGenService, SpecsService.contracts, ContractsView
  - Tests first: "run all stops when contract models fail", "keeps the output collected before a killed or failed process", outside-workspace contract folder in "refuses to save outside the contract folders", single headings in the Contracts tabs test.
  - verify: those tests pass and `node specs/tools/spec.mjs verify SPEC-0005` exits 0

## Notes

<!-- Optional: sequencing constraints, tasks added during implementation and why. -->
- T-7's runtime check found that `cmd.exe` does not resolve a bare `gradlew.bat` when `NoDefaultCurrentDirectoryInExePath` is set; fixed with `.\gradlew.bat` (design.md, Alternatives & Decisions) and the test updated first.
