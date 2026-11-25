# Verification — SPEC-0076: Make developer cockpit a standalone generic tool

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the `spec verify` run of 2026-11-25 12:02 UTC
(`evidence/developer-cockpit-2.log`: 119 files, 734 passed, 2 skipped; the two skips predate this
ticket).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | One tile per service, grouped, UP/DOWN/UNKNOWN per check kind, "N of M up" | `MonitorService.test.ts#httpCheck_upBelow400_downOtherwise`, `#actuatorCheck_mapsStatusAndComponents`, `#tcpCheck_upWhenPortAccepts` (real HTTP and TCP stubs); `MonitorView.test.tsx#showsOneTilePerServiceGroupedWithUpCount` (groups in config order, "2 of 3 up", per-group "1/2 up"). Live: a poll of the OMS `cockpit.yaml` against the running stack showed 15 UP, and DOWN with "ECONNREFUSED" for the two profile-only services | PASS |
| AC-2 | Unreachable/timeout → DOWN with reason and URL, others still update, UP→DOWN in the timeline with its time | `MonitorService.test.ts#unreachableOrTimeout_isDownWithReasonAndTarget`, `#oneFailingService_othersStillChecked`; `monitor-store.test.ts#statusChange_addsTimelineEntryWithTime`; `MonitorView.test.tsx#the timeline lists status changes between polls` | PASS |
| AC-3 | Sparkline and history strip of at most 30 checks | `monitor-store.test.ts#historyKeepsLast30Checks`; `MonitorTiles.test.tsx#tileShowsSparklineAndHistoryStrip` | PASS |
| AC-4 | stat/timeseries/bars panels from stubbed PromQL API and scrape endpoint; a failing source only affects its panel | `MonitorService.test.ts#promqlStatBarsAndRange_fromStubbedApi`, `#scrapePanels_sumGroupQuantile`, `#failingPanelSource_errorOnlyOnThatPanel`; `prometheusParser.test.ts#parsesTextFormat`; `MonitorTiles.test.tsx#panelsRenderStubValues`; scrape rate and series in `monitor-store.test.ts#derives a per-minute rate and a series from scraped values` | PASS |
| AC-5 | Invalid entry → error naming file and path in Monitoring and Settings, app still works; no file → empty state naming the file | `projectConfig.test.ts#invalidEntries_reportedWithPath`, `#yamlSyntaxError_reportedWithLine`; `ProjectConfigService.test.ts#absentFile_defaultsWithoutError`; `ConfigService.test.ts#an invalid project file changes nothing and reports its errors`; `MonitorView.test.tsx#configErrorBanner_namesFileAndPath`, `#emptyState_namesFile`; `SettingsView.test.tsx#projectCard_showsValidationErrors` | PASS |
| AC-6 | No `oms` in `src/`; defaults, prompts, menu, watcher paths and codegen tasks come from `cockpit.yaml` | `noProjectSpecifics.test.ts#srcHasNoOmsReferences` (words, `oms-`/`oms_` prefixes and camelCase such as `omsCoreUrl`); with a non-OMS "Acme" fixture: `ConfigService.test.ts#projectFileOverridesUserProjectSettings`, `CodeGenService.test.ts#tasksComeFromProjectConfig`, `WatcherService.test.ts#watchesConfiguredPaths`, `AiService.test.ts#systemPromptNamesConfiguredProject`, `menu.test.ts#helpMenuListsProjectLinks`, `kbChatSources.test.ts#strips and finds citations under the configured root` | PASS |
| AC-7 | OMS `cockpit.yaml` valid, one service per compose service, panels for the former tiles | `omsSampleConfig.test.ts#omsCockpitYaml_validCoversComposeAndFormerTiles` (17 = 17 compose services; orders by state, order events, time to ack p99, time to market p99, outbox pending, stuck and oldest age), `#every path it names exists`, `#its template files parse into named requests`. Metric names checked against Mimir and oms-core's `/actuator/prometheus` | PASS |
| AC-8 | Fresh clone of the new repository: `npm ci && npm run typecheck && npm test` pass; history carried over; README documents `cockpit.yaml` | Fresh clone of `github.com/tbaderts/developer-cockpit` at `b46696a` (2026-11-25): `npm ci` exit 0, `npm run typecheck` exit 0, `npm test` exit 0 with 118 files passed and 1 skipped (720 passed, 16 skipped: the tests that need OMS content next to the cockpit). `git log` has 21 commits, 18 of them the cockpit's history from the OMS repository. The README has a "The project file: `cockpit.yaml`" section, and `examples/cockpit.yaml` is checked by `projectConfig.test.ts#exampleConfigIsValid`. The install skipped the Electron binary download (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`), which the tests do not need | PASS |

## Goal Assessment

The goal asked for four things:
- **Move the cockpit to its new home.** Done. `main` on github.com/tbaderts/developer-cockpit holds
  the cockpit's history plus this ticket's work, and builds from a fresh clone.
- **Make it OMS-agnostic, with no proprietary logic.** Done. Every OMS-specific item from the
  design's inventory is now configuration: paths, code generation, prompts, the knowledge-server URL,
  the API Explorer convention and the metric tiles. A test keeps OMS names out of `src/`.
- **Configurable monitoring of services and endpoints.** Done.
- **A sample config for all OMS services.** Done. The OMS `cockpit.yaml` covers all 17 compose
  services.

On "less boring", the screen now has a service board with up counts, response-time sparklines, a
history strip, a status-change timeline, per-service links, and stat, time-series and bar panels.

What is left out on purpose, as the proposal set it:
- **`developer-cockpit/` stays in this repository** until a follow-up chore removes it, together
  with its `specs/config.json` module entry.
- **The spec toolkit and `okf-check` stay in this repository.** The cockpit calls them through
  configurable paths, and its tests carry a snapshot of the toolkit.
- **The Orders tab and order follow-up are removed.** This was approved in the proposal. Orders are
  reachable through the query API operations and the `.http` templates.

Accepted with the change:
- **The raw Prometheus text pane is not replaced.** Grafana Explore covers it.
- **The two p99 panels need the observability stack.** oms-core's own endpoint has no histograms
  for them. The other order-flow panels read oms-core directly, so host-native runs keep them.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract added or moved |
| P-02 | Specification before code, generated models only | N/A | No API models; the `cockpit.yaml` format was specified in design.md before code |
| P-03 | Never edit generated code | N/A | No generated code touched |
| P-04 | Contracts evolve compatibly | N/A | No OpenAPI/Avro change |
| P-05 | Every state change is recorded in the event log | N/A | No order state |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | Overlapping polls guarded by the in-flight flag (`monitor-store.test.ts#overlapping polls are ignored`) |
| P-09 | Commands and queries stay separate | N/A | No OMS API change |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order transitions |
| P-11 | Layering and conventions | PASS | Services, IPC handlers, shared types, stores and views as in the rest of the cockpit; the never-throw HTTP seam is kept |
| P-12 | Jackson 3 only | N/A | TypeScript only |
| P-13 | Errors and validation follow the framework specs | PASS | Config problems are data with paths; every catch returns a typed error |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to passing tests above; AC-8 by the fresh-clone run |
| P-15 | Observability | PASS | `[monitor] poll …`, `[config] cockpit.yaml …`, `[api-explorer] …` log lines, no secrets in them |
| P-16 | Security | PASS | Requests and checks only from the main process; http(s) only; changing requests to non-local hosts need confirmation and redirects are not followed; credential headers are not written to the history; `$ref`s cannot leave the spec folder; codegen `cwd` must stay inside the workspace; the README states that `cockpit.yaml` is trusted like a build file. The split history and the published tree were scanned for secrets before pushing (only test placeholders) |
| P-17 | Simplicity and dependencies | PASS | No new dependency; charts are inline SVG |
| P-18 | Modules build standalone | PASS | Module check in this repository (evidence) and in a fresh clone of the new repository (AC-8) |
| P-19 | Documentation follows behaviour | PASS | `tools/developer-cockpit.md`, `tools/index.md`, `delivery/spec-driven-development.md`, `infrastructure/local-docker-stack.md`, NFR-007, `log.md`; storyboard card re-pinned; `okf-check` 0 errors |

## Independent Review

The spec-reviewer found AC-1 to AC-7 proven by the tests, with one blocking finding (no evidence
yet) and twelve major or minor ones:

1. *Blocking: no evidence, verification not written.* **Resolved**: fresh-clone run (AC-8),
   `spec verify` and this document.
2. *Major: the OMS panels needed Mimir, so host-native runs lost their KPIs; the outbox oldest age
   was lost.* **Fixed**: orders by state, events and outbox (now including the oldest age) read
   oms-core's `/actuator/prometheus`; only the two p99 panels use Mimir, where the histograms
   are. The raw pane removal is recorded as accepted in design D-10.
3. *Major: request headers, including credentials, stored in plain text in the history.*
   **Fixed**: credential header values are replaced by `<redacted>`
   (`apiExplorer.ipc.test.ts#stores credential headers without their values`).
4. *Major: redirects bypass the host confirmation; the renderer may send to any URL.*
   **Fixed**: `redirect: 'manual'`
   (`HttpRequestService.test.ts#returns a redirect instead of following it…`). Free URLs are kept
   on purpose: sending any request is the point of the editor, and changing requests to non-local
   hosts still need confirmation.
5. *Major: OMS knowledge-server integration left in the tool (default URL on oms-mcp-server's port,
   tool names, example path).* **Fixed**: no built-in URL; `knowledgeBase.serverUrl` in
   `cockpit.yaml` (set for the OMS); the three MCP tools are documented in the README as the
   knowledge-server protocol; neutral example path and comments.
6. *Minor: leftover OMS wording the scan missed.* **Fixed**: neutral placeholders, generic removal
   of stale settings, scan widened to camelCase names.
7. *Minor: an edited `cockpit.yaml` only partly reloaded.* **Fixed**: a poll that no longer matches
   the config on screen re-reads it first (`monitor-store.test.ts#a poll that no longer matches…`);
   the Help menu and KB prefix follow the file. The watched folders still apply on the next start
   (follow-up).
8. *Minor: `$ref` containment on another drive, refs resolved against the spec folder.* **Fixed**
   (`ApiCatalogService.test.ts#resolves a file ref relative to the file that contains it…`).
9. *Minor: the 5 MB cap is applied after the whole body is read.* **Not fixed**, follow-up; the same
   as before this ticket.
10. *Minor: one invalid entry disables the whole file.* **Kept as designed**; the Settings card now
    says what is switched off.
11. *Minor: unused Prometheus/Grafana/Loki URL settings.* **Fixed**: removed.
12. *Minor: design drift not recorded.* **Fixed**: design D-10.
13. *Minor: `cockpit.yaml` decides what is executed.* **Fixed**: a trust paragraph in the README.

## Automated Evidence

`evidence/last-run.json`: ran 2026-11-25T12:02:26Z, result pass, modules developer-cockpit and
oms-knowledge-base, policy check PASS (no errors, no warnings, changes since merge-base 3baed200).

| Module | Command | Exit | Log |
|---|---|---|---|
| developer-cockpit | `npm run typecheck` | 0 (13 s) | `evidence/developer-cockpit-1.log` |
| developer-cockpit | `npm test` | 0 (70 s; 119 files, 734 passed, 2 skipped) | `evidence/developer-cockpit-2.log` |

Outside the gate: the fresh clone of the new repository (AC-8), and `okf-check` on
`oms-knowledge-base` (0 errors).

## Follow-ups

- Remove `developer-cockpit/` from this repository and its entry in `specs/config.json`; point
  developers at the new repository (chore ticket; the config change is a human's).
- Rebuild watched folders when `cockpit.yaml` changes (they apply on the next start).
- Cap response bodies while reading them, not after (`MonitorService`, `HttpRequestService`).
- The cockpit's `spec/` blueprint and its test fixtures still use OMS examples and names; make
  them generic in the new repository.
- The Playwright e2e specs (not part of the module check) still reference the old API Explorer and
  Monitoring screens.
- CI for the new repository, and the spec toolkit and `okf-check` as packages the cockpit could
  depend on instead of a test snapshot.

## Verdict

Verdict: GOAL MET
