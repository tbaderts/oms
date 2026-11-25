# Tasks — SPEC-0076: Make developer cockpit a standalone generic tool

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

- [x] **T-1** Add the `cockpit.yaml` schema and parser test-first (AC-5)
  - files: developer-cockpit/src/shared/projectConfig.ts, developer-cockpit/test/shared/projectConfig.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/shared/projectConfig.test.ts` passes, incl. `invalidEntries_reportedWithPath` and `yamlSyntaxError_reportedWithLine`
- [x] **T-2** Add `ProjectConfigService`; let `cockpit.yaml` override the user config for project settings; drop `omsCoreUrl`, the legacy path migration and the OMS defaults (AC-5, AC-6)
  - files: developer-cockpit/src/main/services/ProjectConfigService.ts, developer-cockpit/src/main/services/ConfigService.ts, developer-cockpit/src/shared/types/config.ts, developer-cockpit/src/shared/types/storyboards.ts, developer-cockpit/test/main/ProjectConfigService.test.ts, developer-cockpit/test/main/ConfigService.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/ProjectConfigService.test.ts test/main/ConfigService.test.ts` passes, incl. `absentFile_defaultsWithoutError` and `projectFileOverridesUserProjectSettings`
- [x] **T-3** Make the Prometheus parser generic (samples, sum, group-by, histogram quantile) test-first (AC-4)
  - files: developer-cockpit/src/shared/prometheusParser.ts, developer-cockpit/test/main/prometheusParser.test.ts, developer-cockpit/test/shared/prometheusParser.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/shared/prometheusParser.test.ts` passes, incl. `parsesTextFormat`
- [x] **T-4** Rewrite the `MonitorService` service checks (http, spring-actuator, tcp, unreachable, timeout) test-first (AC-1, AC-2)
  - files: developer-cockpit/src/main/services/MonitorService.ts, developer-cockpit/src/shared/types/monitor.ts, developer-cockpit/test/main/MonitorService.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/MonitorService.test.ts` passes, incl. `httpCheck_upBelow400_downOtherwise`, `actuatorCheck_mapsStatusAndComponents`, `tcpCheck_upWhenPortAccepts`, `unreachableOrTimeout_isDownWithReasonAndTarget`, `oneFailingService_othersStillChecked`
- [x] **T-5** Add metric panels to `MonitorService` (PromQL instant and range, scrape sum, group and quantile, failing source isolated) test-first (AC-4)
  - files: developer-cockpit/src/main/services/MonitorService.ts, developer-cockpit/src/shared/types/monitor.ts, developer-cockpit/test/main/MonitorService.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/MonitorService.test.ts` passes, incl. `promqlStatBarsAndRange_fromStubbedApi`, `scrapePanels_sumGroupQuantile`, `failingPanelSource_errorOnlyOnThatPanel`
- [x] **T-6** Wire the `monitor:config` and `monitor:poll` IPC and preload types (AC-1, AC-4, AC-5)
  - files: developer-cockpit/src/main/ipc/monitor.ipc.ts, developer-cockpit/src/main/preload.ts, developer-cockpit/src/shared/types/ipc.ts, developer-cockpit/src/main/index.ts
  - verify: `cd developer-cockpit && npm run typecheck` passes
- [x] **T-7** Rewrite the monitor store (history ring of 30 per service, status-change timeline, panel series, in-flight guard) test-first (AC-2, AC-3)
  - files: developer-cockpit/src/renderer/stores/monitor.ts, developer-cockpit/test/renderer/monitor-store.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/renderer/monitor-store.test.ts` passes, incl. `statusChange_addsTimelineEntryWithTime` and `historyKeepsLast30Checks`
- [x] **T-8** Build the Monitoring view (service board, tiles with sparkline and history strip, timeline, panels, error banner, empty state) and remove the six OMS tiles, test-first (AC-1, AC-3, AC-4, AC-5)
  - files: developer-cockpit/src/renderer/views/monitor/*, developer-cockpit/test/renderer/MonitorView.test.tsx, developer-cockpit/test/renderer/MonitorTiles.test.tsx, developer-cockpit/test/renderer/RawPrometheusPane.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/MonitorView.test.tsx test/renderer/MonitorTiles.test.tsx` passes, incl. `showsOneTilePerServiceGroupedWithUpCount`, `tileShowsSparklineAndHistoryStrip`, `panelsRenderStubValues`, `configErrorBanner_namesFileAndPath`, `emptyState_namesFile`
- [x] **T-9** Add the Settings Project card (file, status, errors, read-only project fields) and remove the oms-core URL field (AC-5, AC-6)
  - files: developer-cockpit/src/renderer/views/settings/SettingsView.tsx, developer-cockpit/src/renderer/stores/config.ts, developer-cockpit/test/renderer/SettingsView.test.tsx
  - verify: `cd developer-cockpit && npx vitest run test/renderer/SettingsView.test.tsx` passes, incl. `projectCard_showsValidationErrors`
- [x] **T-10** Take code-generation tasks from `cockpit.yaml` test-first (AC-6)
  - files: developer-cockpit/src/main/services/CodeGenService.ts, developer-cockpit/src/shared/types/specs.ts, developer-cockpit/src/renderer/views/code-generator/*, developer-cockpit/src/renderer/views/contracts/ContractsView.tsx, developer-cockpit/test/main/CodeGenService.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/CodeGenService.test.ts` passes, incl. `tasksComeFromProjectConfig`
- [x] **T-11** Watch the configured paths and use the configured spec CLI and KB check script, test-first (AC-6)
  - files: developer-cockpit/src/main/services/WatcherService.ts, developer-cockpit/src/main/services/SpecCli.ts, developer-cockpit/src/main/services/OkfCli.ts, developer-cockpit/test/main/WatcherService.test.ts, developer-cockpit/test/main/OkfCli.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/WatcherService.test.ts test/main/OkfCli.test.ts` passes, incl. `watchesConfiguredPaths`
- [x] **T-12** Build AI prompts and KB citation prefixes from the project config, test-first (AC-6)
  - files: developer-cockpit/src/main/ai/AiService.ts, developer-cockpit/src/main/ai/McpToolRegistry.ts, developer-cockpit/src/main/storyboards/StoryboardAiService.ts, developer-cockpit/src/shared/kbPath.ts, developer-cockpit/src/renderer/lib/kbChatSources.ts, developer-cockpit/src/renderer/stores/kbChat.ts, developer-cockpit/test/main/AiService.test.ts, developer-cockpit/test/renderer/kbChatSources.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/AiService.test.ts test/renderer/kbChatSources.test.ts test/main/StoryboardAiService.test.ts` passes, incl. `systemPromptNamesConfiguredProject`
- [x] **T-13** Make the storyboard library, roots and state-diagram document configurable (AC-6)
  - files: developer-cockpit/src/main/services/kbLayout.ts, developer-cockpit/src/main/storyboards/LinkIndexService.ts, developer-cockpit/src/main/storyboards/StoryboardService.ts, developer-cockpit/src/renderer/views/storyboards/NewStoryWizard.tsx, developer-cockpit/test/main/LinkIndexService.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/LinkIndexService.test.ts test/main/StoryboardService.scan.test.ts` passes
- [x] **T-14** Build the Help menu from the project links, test-first (AC-6)
  - files: developer-cockpit/src/main/menu.ts, developer-cockpit/test/main/menu.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/menu.test.ts` passes, incl. `helpMenuListsProjectLinks`
- [x] **T-15** Make the API catalog list the operations of any configured OpenAPI spec, with discriminator variants, test-first (AC-6)
  - files: developer-cockpit/src/main/services/ApiCatalogService.ts, developer-cockpit/src/shared/apiExplorer.ts, developer-cockpit/test/main/ApiCatalogService.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/ApiCatalogService.test.ts` passes
- [x] **T-16** Replace `OmsHttpService` with a generic `HttpRequestService` and rewire the API Explorer IPC, test-first (AC-6)
  - files: developer-cockpit/src/main/services/HttpRequestService.ts, developer-cockpit/src/main/services/OmsHttpService.ts, developer-cockpit/src/main/ipc/apiExplorer.ipc.ts, developer-cockpit/src/shared/types/ipc.ts, developer-cockpit/test/main/HttpRequestService.test.ts, developer-cockpit/test/main/OmsHttpService.test.ts, developer-cockpit/test/main/apiExplorer.ipc.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/HttpRequestService.test.ts test/main/apiExplorer.ipc.test.ts` passes
- [x] **T-17** Rebuild the API Explorer UI as Operations, Templates and History; remove the Orders tab and order follow-up (AC-6)
  - files: developer-cockpit/src/renderer/stores/apiExplorer.ts, developer-cockpit/src/renderer/views/api-explorer/*, developer-cockpit/src/renderer/lib/api-schema.ts, developer-cockpit/src/renderer/lib/api-templates.ts, developer-cockpit/test/renderer/ApiExplorer.*.test.tsx, developer-cockpit/test/renderer/api-schema.test.ts, developer-cockpit/test/renderer/api-templates.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/renderer/ApiExplorer test/renderer/api-schema.test.ts test/renderer/api-templates.test.ts` passes
- [x] **T-18** Remove the remaining OMS wording and add the scan test (AC-6)
  - files: developer-cockpit/src/**, developer-cockpit/test/main/noProjectSpecifics.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/noProjectSpecifics.test.ts` passes (`srcHasNoOmsReferences`)
- [x] **T-19** Add the OMS `cockpit.yaml` (all compose services, the former tiles as panels), move the OMS `.http` templates to `tools/api-templates/`, and confirm the metric names against oms-core or Mimir (AC-7)
  - files: cockpit.yaml, tools/api-templates/orders.http, tools/api-templates/lifecycle.http, developer-cockpit/api-templates/*, developer-cockpit/test/main/omsSampleConfig.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/omsSampleConfig.test.ts` passes (`omsCockpitYaml_validCoversComposeAndFormerTiles`)
- [x] **T-26** Make the test suite self-contained: vendor the spec toolkit as a test fixture, find `REPO_ROOT` as the enclosing git repository, and skip host-content tests with a reason when that content is absent (AC-8)
  - files: developer-cockpit/test/fixtures/workspace.ts, developer-cockpit/test/fixtures/spec-toolkit/**, developer-cockpit/test/main/OkfCli.test.ts, developer-cockpit/test/main/KbService.test.ts, developer-cockpit/test/main/LinkIndexService.test.ts, developer-cockpit/test/main/checkStoryboards.test.ts, developer-cockpit/test/main/SpecsService.contracts.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/SpecTicketsService.test.ts test/main/OkfCli.test.ts` passes, and a copy of the cockpit outside any repository runs `npx vitest run test/main/SpecTicketsService.test.ts` green
- [x] **T-20** Run the module's full check (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7)
  - files: (none)
  - verify: `cd developer-cockpit && npm run typecheck && npm test` passes
- [x] **T-21** Rewrite the cockpit README for the new home and add a generic `examples/cockpit.yaml` (AC-8)
  - files: developer-cockpit/README.md, developer-cockpit/examples/cockpit.yaml, developer-cockpit/test/shared/projectConfig.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/shared/projectConfig.test.ts` passes, incl. `exampleConfigIsValid` (valid, no `oms`), and the README has a `cockpit.yaml` section
- [x] **T-22** Update the knowledge base (P-19)
  - files: oms-knowledge-base/tools/developer-cockpit.md, oms-knowledge-base/tools/index.md, oms-knowledge-base/delivery/spec-driven-development.md, oms-knowledge-base/infrastructure/local-docker-stack.md, oms-knowledge-base/capabilities/non-functional-requirements/NFR-007-observability.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no errors
- [x] **T-23** Split the cockpit history, scan it for secrets, push it to github.com/tbaderts/developer-cockpit, then commit and push the ticket's working copy (AC-8)
  - files: (new repository)
  - verify: the secret scan finds nothing; `git ls-remote https://github.com/tbaderts/developer-cockpit.git refs/heads/main` shows the new commit
- [x] **T-24** Prove the new repository builds from a fresh clone (AC-8)
  - files: (none)
  - verify: in a fresh clone, `npm ci && npm run typecheck && npm test` passes and `git log --oneline` lists at least 19 commits
- [x] **T-25** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0076` exits 0

## Notes

T-1 → T-2 come first: every later slice reads `ProjectConfig`. T-4/T-5 before T-6, T-6 before
T-7/T-8. T-15 → T-16 → T-17 in order. T-18 runs after all slices so the scan only has wording
left. T-23 needs T-20 and T-21 green, since it publishes the working copy.

T-26 was added during T-11 (design D-9): the tests read the surrounding OMS checkout, so a fresh
clone of the new repository (AC-8) could not pass. It runs before T-20.

T-24 first failed in the fresh clone: `test/main/menu.test.ts` imported `electron`, which throws
when its binary is not installed (the run used `ELECTRON_SKIP_BINARY_DOWNLOAD=1`). The test now
mocks electron like the other main-process tests; pushed as 6e2efab, then the clean run passed.
