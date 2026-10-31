# Tasks — SPEC-0007: API Explorer as OMS-aware console

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

All `vitest` commands run from `developer-cockpit/` as `./node_modules/.bin/vitest run <files>`.
Each behaviour task writes its tests first and sees them fail before the change.

- [x] **T-1** Shared tables and helpers: paths, `FILTER_FIELDS`, `toSearchParams`, `isLocalHost`, types (AC-6, AC-7)
  - files: developer-cockpit/src/shared/apiExplorer.ts, developer-cockpit/test/shared/apiExplorer.test.ts
  - Tests first: "toSearchParams builds eq, op and between keys and rejects unknown fields or operators", "FILTER_FIELDS matches the query API description", "isLocalHost".
  - verify: `./node_modules/.bin/vitest run test/shared/apiExplorer.test.ts` passes
- [x] **T-2** Catalog service: command types from the discriminator, bundled schemas with `$ref`/`allOf`, enums; watcher covers oms-contracts (AC-1)
  - files: developer-cockpit/src/main/services/ApiCatalogService.ts, developer-cockpit/src/main/services/WatcherService.ts, developer-cockpit/test/main/ApiCatalogService.test.ts, developer-cockpit/test/main/WatcherService.test.ts
  - verify: `./node_modules/.bin/vitest run test/main/ApiCatalogService.test.ts test/main/WatcherService.test.ts` passes
- [x] **T-3** Template, body check and `orderIdOf` (AC-2, AC-3, AC-5)
  - files: developer-cockpit/src/renderer/lib/api-schema.ts, developer-cockpit/test/renderer/api-schema.test.ts
  - Tests run against the catalog built from the repository's contracts (all 7 command types).
  - verify: `./node_modules/.bin/vitest run test/renderer/api-schema.test.ts` passes
- [x] **T-4** HTTP service: send, search, follow-up, timeout, unreachable, host guard, logging (AC-3, AC-4, AC-5, AC-6, AC-7)
  - files: developer-cockpit/src/main/services/OmsHttpService.ts, developer-cockpit/test/main/OmsHttpService.test.ts
  - Real `http.createServer` on an ephemeral port for the send cases; fake fetch for follow-up shapes.
  - verify: `./node_modules/.bin/vitest run test/main/OmsHttpService.test.ts` passes
- [x] **T-5** History service (AC-8)
  - files: developer-cockpit/src/main/services/ApiHistoryService.ts, developer-cockpit/test/main/ApiHistoryService.test.ts
  - verify: `./node_modules/.bin/vitest run test/main/ApiHistoryService.test.ts` passes
- [x] **T-6** Config key, IPC, preload and registration (AC-8, AC-9)
  - files: developer-cockpit/src/shared/types/config.ts, developer-cockpit/src/main/ipc/apiExplorer.ipc.ts, developer-cockpit/src/main/index.ts, developer-cockpit/src/main/preload.ts, developer-cockpit/src/shared/types/ipc.ts, developer-cockpit/test/main/apiExplorer.ipc.test.ts
  - verify: `./node_modules/.bin/vitest run test/main/apiExplorer.ipc.test.ts` passes and `npm run typecheck` passes
- [x] **T-7** Store and Commands tab: type list, editor, findings, send, response, confirmation, live catalog reload (AC-1, AC-3, AC-4, AC-7)
  - files: developer-cockpit/src/renderer/stores/apiExplorer.ts, developer-cockpit/src/renderer/views/api-explorer/ApiExplorerView.tsx, developer-cockpit/src/renderer/views/api-explorer/CommandsTab.tsx, developer-cockpit/src/renderer/components/layout/ContentArea.tsx, developer-cockpit/test/renderer/ApiExplorer.commands.test.tsx
  - verify: `./node_modules/.bin/vitest run test/renderer/ApiExplorer.commands.test.tsx` passes
- [x] **T-8** Order follow-up panel with Next command (AC-5)
  - files: developer-cockpit/src/renderer/views/api-explorer/OrderFollowUp.tsx, developer-cockpit/src/renderer/stores/apiExplorer.ts, developer-cockpit/test/renderer/ApiExplorer.followup.test.tsx
  - verify: `./node_modules/.bin/vitest run test/renderer/ApiExplorer.followup.test.tsx` passes
- [x] **T-9** Orders tab: filter builder, URL, results, paging, row opens follow-up (AC-6)
  - files: developer-cockpit/src/renderer/views/api-explorer/OrdersTab.tsx, developer-cockpit/src/renderer/stores/apiExplorer.ts, developer-cockpit/test/renderer/ApiExplorer.orders.test.tsx
  - verify: `./node_modules/.bin/vitest run test/renderer/ApiExplorer.orders.test.tsx` passes
- [x] **T-10** History tab: list, restore, clear (AC-8)
  - files: developer-cockpit/src/renderer/views/api-explorer/HistoryTab.tsx, developer-cockpit/src/renderer/stores/apiExplorer.ts, developer-cockpit/test/renderer/ApiExplorer.history.test.tsx
  - verify: `./node_modules/.bin/vitest run test/renderer/ApiExplorer.history.test.tsx` passes
- [x] **T-11** Settings: oms-core URL input (AC-9)
  - files: developer-cockpit/src/renderer/views/settings/SettingsView.tsx, developer-cockpit/test/renderer/SettingsView.test.tsx
  - verify: `./node_modules/.bin/vitest run test/renderer/SettingsView.test.tsx` passes and `npm run typecheck` passes
- [x] **T-12** Runtime check against a running oms-core (AC-4, AC-5, AC-6, AC-8)
  - verify: with `docker compose up -d postgres broker schema-registry oms-core` running, the built app over CDP: OrderCreateCmd gives 201 and a follow-up with event v1; Next command OrderAcceptCmd gives timeline v2; an Orders search finds the order and the row opens its follow-up; History lists the sends; screenshots of each tab inspected for overlap or clipping
- [x] **T-13** Update cockpit spec pages
  - files: developer-cockpit/spec/03-features.md, developer-cockpit/spec/02-information-architecture.md, developer-cockpit/spec/04-backend-services.md, developer-cockpit/spec/05-data-model.md
  - verify: 03-features has an API Explorer section covering Commands, follow-up, Orders, History, target and guard; 04 lists the three services and the IPC channels; 05 documents `omsCoreUrl` and the history file
- [x] **T-14** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0007` exits 0

### Review fixes (ticket reopened at implement)

- [x] **T-15** Review findings 2–6 and the history time (AC-3, AC-5, AC-6, AC-8)
  - files: developer-cockpit/src/renderer/lib/api-schema.ts, developer-cockpit/src/renderer/stores/apiExplorer.ts, developer-cockpit/src/main/ipc/apiExplorer.ipc.ts, developer-cockpit/src/main/services/OmsHttpService.ts, developer-cockpit/src/renderer/views/api-explorer/OrderFollowUp.tsx, developer-cockpit/src/renderer/views/api-explorer/HistoryTab.tsx, developer-cockpit/src/shared/apiExplorer.ts, tests: api-schema, OmsHttpService, apiExplorer.ipc, ApiExplorer.orders, ApiExplorer.followup, ApiExplorer.history
  - Tests first: a required property set to null is "expected string, got null"; editing filters, size or sort after paging shows `page=0` (the URL Search sends); a send refused in main is recorded as `refused`, not unreachable, and a failing history write does not lose the response; `followUp('  ')` is refused without a request; a failed order query shows its error, not "not found"; each history entry shows its time.
  - verify: `./node_modules/.bin/vitest run test/renderer/api-schema.test.ts test/main/OmsHttpService.test.ts test/main/apiExplorer.ipc.test.ts test/renderer/ApiExplorer.orders.test.tsx test/renderer/ApiExplorer.followup.test.tsx test/renderer/ApiExplorer.history.test.tsx` passes and `npm run typecheck` passes
- [x] **T-16** Run spec verify again
  - verify: `node specs/tools/spec.mjs verify SPEC-0007` exits 0

## Notes

- All test commands run from `developer-cockpit/` with `./node_modules/.bin/vitest run …` (npx resolves the wrong cwd in this environment).
- T-1..T-5 are main/shared and have no UI; T-7..T-11 build the view on top. T-12 needs Docker for oms-core.
- T-3: the red run was not observed (the first run went to the wrong directory); the module did not exist yet, so the tests could not have passed.
- T-7 was ticked by a chained command before its verify ran, then unticked and re-ticked after `ApiExplorer.commands.test.tsx` and the typecheck passed.
- T-13 was done before T-12: the runtime check needs the user's running cockpit closed (it holds WebSocket port 9321, hard-coded), the docs do not depend on it.
- T-12 result (built app over CDP, oms-core from the running Docker stack, 1440×900): 7 command types; restored OrderCreateCmd (`clOrdId` `spec-0007-check-1793100170267`) → 201, follow-up showed UNACK and event v1; the exchange simulator rejected the order (v2 REJ), so **Next command** → OrderAcceptCmd (template with `orderId` preset) was refused by oms-core with 400 "Invalid state transition from REJ to LIVE", shown in the response panel, timeline v1/v2; Orders search `clOrdId eq …` → URL shown, 1 row, click opened the follow-up; History listed the sends with 201/400/200. No console errors, no horizontal overflow; screenshots inspected.
  - How the body got into the editor: typing into Monaco over CDP was unreliable (focus, auto-closing brackets), so the create body was seeded as a history entry (status null, shown as *unreachable*) while the app was closed and put back with **Restore**, which also exercises AC-8's restore path.
  - Found: oms-core refuses an order without `sessionId` ("SessionId is required") although `Order` in `oms-cmd-api.yml` does not list it as required, so a pure template cannot create an order. Contract/server mismatch outside this ticket → follow-up.
- Small deviations recorded in design.md (Changed during implementation): synchronous body check, own JSON error locator, `namesOrder` rule.
