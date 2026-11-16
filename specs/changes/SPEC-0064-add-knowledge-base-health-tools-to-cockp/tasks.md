# Tasks — SPEC-0064: Add knowledge base health tools to cockpit

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

Verify commands run from the repository root. `C` stands for `cd tools/okf-check && node --test`
and `V` for `cd developer-cockpit && npx vitest run`.

- [x] **T-1** Write `test/report.test.mjs` (stats, `--json`, unchanged text), then return `stats` from `checkBundle` and add `--json` to the CLI (AC-2, AC-3)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/report.test.mjs
  - verify: `C test/report.test.mjs` passes, and `C` (all checker tests) passes
- [x] **T-2** Add the warning tests (OMS-AGE, OMS-STALE, OMS-DEPRECATED, OMS-DRIFT with a temp git repo, exit code unchanged), then implement `checkFreshness` with an injectable `now` (AC-4)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/report.test.mjs
  - verify: `C test/report.test.mjs` passes
- [x] **T-3** Write `test/fix-indexes.test.mjs`, then implement `planIndexFixes` / `applyIndexFixes` and `--fix-indexes [--dry-run] [--json]` (AC-5)
  - files: tools/okf-check/okf-check.mjs, tools/okf-check/test/fix-indexes.test.mjs
  - verify: `C test/fix-indexes.test.mjs` passes
- [x] **T-4** Add the health and index-fix types to `shared/types/kb.ts`, then write `test/main/OkfCli.test.ts` and implement `services/OkfCli.ts` (AC-8)
  - files: developer-cockpit/src/shared/types/kb.ts, developer-cockpit/src/main/services/OkfCli.ts, developer-cockpit/test/main/OkfCli.test.ts
  - verify: `V test/main/OkfCli.test.ts` passes
- [x] **T-5** Write the IPC test, then add `kb:health` / `kb:fixIndexes` (with a rescan after apply), the preload and the `ipc.ts` types (AC-8, AC-7)
  - files: developer-cockpit/src/main/ipc/kb.ipc.ts, developer-cockpit/src/main/preload.ts, developer-cockpit/src/shared/types/ipc.ts, developer-cockpit/test/main/kb.ipc.test.ts
  - verify: `V test/main/kb.ipc.test.ts` passes
- [x] **T-6** Write `test/renderer/FrontMatterPanel.test.tsx`, then implement `FrontMatterPanel.tsx` and render it in `DocumentViewer` (AC-1)
  - files: developer-cockpit/src/renderer/views/knowledge-base/FrontMatterPanel.tsx, developer-cockpit/src/renderer/views/knowledge-base/DocumentViewer.tsx, developer-cockpit/test/renderer/FrontMatterPanel.test.tsx
  - verify: `V test/renderer/FrontMatterPanel.test.tsx` passes
- [x] **T-7** Write `test/renderer/KbHealthPanel.test.tsx`, then implement `KbHealthPanel.tsx` and the Health toggle in `KnowledgeBaseView` (AC-6, AC-7)
  - files: developer-cockpit/src/renderer/views/knowledge-base/KbHealthPanel.tsx, developer-cockpit/src/renderer/views/knowledge-base/KnowledgeBaseView.tsx, developer-cockpit/test/renderer/KbHealthPanel.test.tsx
  - verify: `V test/renderer/KbHealthPanel.test.tsx` passes
- [x] **T-8** Add `review_after_days: 180` to `okf-conventions.md`, run the report and the index fix on the real bundle, and record the counts (AC-4, AC-5, AC-9)
  - files: oms-knowledge-base/okf-conventions.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors, and `--fix-indexes --dry-run` reports no changes
- [x] **T-9** Update the documentation: `okf-conventions.md` (warnings), `tools/developer-cockpit.md`, `semantic-layer/knowledge-base-strategy.md`, `tools/okf-check/README.md`, `log.md` (AC-9)
  - files: oms-knowledge-base/okf-conventions.md, oms-knowledge-base/tools/developer-cockpit.md, oms-knowledge-base/semantic-layer/knowledge-base-strategy.md, tools/okf-check/README.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports 0 errors, and `node tools/okf-check/check-kb-refs.mjs` reports 0 findings
- [x] **T-10** Run the full verification (AC-9)
  - files: none
  - verify: `cd tools/okf-check && npm test` passes, and `node specs/tools/spec.mjs verify SPEC-0064` passes

## Notes

- The checker tasks (T-1 to T-3) come first: the cockpit's OkfCli tests run the real CLI.
- The checker's tests are not in the spec gate's verify list (TD-14, human-only), so T-10 runs them
  explicitly and verification.md records their output.
- **T-8 on the real bundle**, with `review_after_days: 180`:
  - 204 concepts, 0 errors, 1 warning. The warning is `OMS-DRIFT` on
    `architecture/context/oms-ui.md`, because `oms-ui/frontend/src/App.tsx` was committed after
    the page.
  - `--fix-indexes --dry-run`: no index changes needed.
  - Review age: 197 current, 0 due, 0 unknown.
  - With the first drift rule (comparing only against `updated`) it reported 112 drift warnings.
    Most of them were pages committed together with their code a few hours after their `updated`
    stamp. Including the page's own last commit removed those false positives (see design.md).
