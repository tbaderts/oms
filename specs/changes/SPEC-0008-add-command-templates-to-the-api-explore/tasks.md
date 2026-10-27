# Tasks — SPEC-0008: Add command templates to the API Explorer

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
> - [x] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

All `vitest` commands run from `developer-cockpit/` as `./node_modules/.bin/vitest run <files>`.
Each behaviour task writes its tests first and sees them fail before the change.

- [x] **T-1** `.http` parser and block formatter in `shared/httpFile.ts` (AC-1, AC-5)
  - files: developer-cockpit/src/shared/httpFile.ts, developer-cockpit/test/shared/httpFile.test.ts
  - Tests first: "parses requests, names, comments and file variables" (CRLF, bare URL, headers vs body, line numbers), "formatTemplateBlock round-trips through parseHttpFile".
  - verify: `./node_modules/.bin/vitest run test/shared/httpFile.test.ts` passes
- [x] **T-2** Template logic: classify, resolve variables, check, templatize, orderToTemplate (AC-1, AC-3, AC-4, AC-5, AC-6)
  - files: developer-cockpit/src/renderer/lib/api-templates.ts, developer-cockpit/src/renderer/lib/api-schema.ts, developer-cockpit/test/renderer/api-templates.test.ts
  - Tests first: "classifies command blocks by type and reports unusable ones", "resolves system, file and orderId variables", "reports unresolved variables", "templatize replaces per-send fields", "orderToTemplate keeps client fields and drops server fields" (against the catalog built from the repository's contracts).
  - verify: `./node_modules/.bin/vitest run test/renderer/api-templates.test.ts` passes
- [x] **T-3** Starter templates in `developer-cockpit/api-templates/` (AC-7)
  - files: developer-cockpit/api-templates/orders.http, developer-cockpit/api-templates/lifecycle.http, developer-cockpit/test/renderer/api-templates.test.ts
  - Tests first: "starter templates cover every command type and pass the check".
  - verify: `./node_modules/.bin/vitest run test/renderer/api-templates.test.ts` passes
- [x] **T-4** `ApiTemplateService`: list sources, missing source, append-only save with name and path guards, log line (AC-2, AC-5)
  - files: developer-cockpit/src/main/services/ApiTemplateService.ts, developer-cockpit/test/main/ApiTemplateService.test.ts
  - Tests first: "lists shared and extra sources and marks a missing one", "appends a template block without changing existing bytes", "refuses a duplicate name, an unknown path and an existing new file".
  - verify: `./node_modules/.bin/vitest run test/main/ApiTemplateService.test.ts` passes
- [x] **T-5** Config key, IPC channels, preload, watcher extra paths and config-save hook (AC-2, AC-5)
  - files: developer-cockpit/src/shared/types/config.ts, developer-cockpit/src/main/ipc/apiExplorer.ipc.ts, developer-cockpit/src/main/ipc/config.ipc.ts, developer-cockpit/src/main/index.ts, developer-cockpit/src/main/preload.ts, developer-cockpit/src/shared/types/ipc.ts, developer-cockpit/src/main/services/WatcherService.ts, developer-cockpit/test/main/apiExplorer.ipc.test.ts, developer-cockpit/test/main/WatcherService.test.ts
  - Tests first: "watches api-templates and the extra template paths"; ipc "templates and saveTemplate channels" and "history stores the body as sent".
  - verify: `./node_modules/.bin/vitest run test/main/apiExplorer.ipc.test.ts test/main/WatcherService.test.ts` passes and `npm run typecheck` passes
- [x] **T-6** Store and Commands tab: template list, selection, variable-aware check, resolved send, live reload (AC-1, AC-2, AC-3, AC-4)
  - files: developer-cockpit/src/renderer/stores/apiExplorer.ts, developer-cockpit/src/renderer/views/api-explorer/CommandsTab.tsx, developer-cockpit/src/renderer/views/api-explorer/ApiExplorerView.tsx, developer-cockpit/test/renderer/api-explorer-fixtures.tsx, developer-cockpit/test/renderer/ApiExplorer.templates.test.tsx
  - Tests first: "lists templates under their command type and loads one", "reloads templates on a .http file event", "sends the resolved body with fresh values each time", "does not send a body with unresolved variables".
  - verify: `./node_modules/.bin/vitest run test/renderer/ApiExplorer.templates.test.tsx test/renderer/ApiExplorer.commands.test.tsx` passes
- [x] **T-7** Save as template dialog (AC-5)
  - files: developer-cockpit/src/renderer/views/api-explorer/SaveTemplateDialog.tsx, developer-cockpit/src/renderer/views/api-explorer/CommandsTab.tsx, developer-cockpit/src/renderer/stores/apiExplorer.ts, developer-cockpit/test/renderer/ApiExplorer.templates.test.tsx
  - Tests first: "saves the editor body as a template".
  - verify: `./node_modules/.bin/vitest run test/renderer/ApiExplorer.templates.test.tsx` passes
- [x] **T-8** Use as template in the order follow-up (AC-6)
  - files: developer-cockpit/src/renderer/views/api-explorer/OrderFollowUp.tsx, developer-cockpit/src/renderer/stores/apiExplorer.ts, developer-cockpit/test/renderer/ApiExplorer.followup.test.tsx
  - Tests first: "Use as template fills an OrderCreateCmd body from the order".
  - verify: `./node_modules/.bin/vitest run test/renderer/ApiExplorer.followup.test.tsx test/renderer/ApiExplorer.orders.test.tsx` passes
- [x] **T-9** Settings: template files textarea (AC-2)
  - files: developer-cockpit/src/renderer/views/settings/SettingsView.tsx, developer-cockpit/test/renderer/SettingsView.test.tsx
  - verify: `./node_modules/.bin/vitest run test/renderer/SettingsView.test.tsx` passes and `npm run typecheck` passes
- [x] **T-10** Runtime check against a running stack (AC-1, AC-3, AC-5, AC-7)
  - verify: built app over CDP with oms-core and the exchange simulator running: the Commands tab lists the starter templates; "INTC limit buy" sent twice gives two 201s with different `clOrdId`s, and the follow-up shows the order not REJ; Save as template into a scratch file appends a block; screenshots inspected for overlap or clipping
- [x] **T-11** Update cockpit spec pages
  - files: developer-cockpit/spec/03-features.md, developer-cockpit/spec/04-backend-services.md, developer-cockpit/spec/05-data-model.md
  - verify: 03 describes templates, sources, variables, Save as template and Use as template; 04 lists ApiTemplateService, the two channels and `setExtraPaths`; 05 documents `apiTemplateSources` and the supported `.http` subset
- [x] **T-12** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0008` exits 0


### Review fixes (ticket reopened at implement)

- [x] **T-13** Review findings 1–4 and 6 (AC-3, AC-5, AC-6)
  - files: developer-cockpit/src/shared/httpFile.ts, developer-cockpit/src/main/services/ApiTemplateService.ts, developer-cockpit/src/renderer/lib/api-templates.ts, developer-cockpit/src/renderer/stores/apiExplorer.ts, developer-cockpit/src/renderer/views/api-explorer/SaveTemplateDialog.tsx, tests: api-templates, ApiTemplateService, ApiExplorer.templates
  - Tests first:
    - a template's file variables that the target file does not declare are written inline, and the dialog defaults to the template's own file;
    - a name equal to a block's `<type> #n` fallback is refused;
    - variables are resolved after the non-local confirmation;
    - `orderToTemplate` drops `expireTime`.
  - verify: `./node_modules/.bin/vitest run test/renderer/api-templates.test.ts test/main/ApiTemplateService.test.ts test/renderer/ApiExplorer.templates.test.tsx` passes and `npm run typecheck` passes
- [x] **T-14** Run spec verify again
  - verify: `node specs/tools/spec.mjs verify SPEC-0008` exits 0

## Notes

<!-- Optional: sequencing constraints, tasks added during implementation and why. -->

- All test commands run from `developer-cockpit/` with `./node_modules/.bin/vitest run …`.
- T-2 and T-3 share `api-templates.test.ts`; the starter-template case was red until T-3 added the files, so T-2 was ticked together with T-3 after the whole file passed.
- Shared template types (`TemplateSource`, `SaveTemplateRequest/Result`, `SHARED_TEMPLATE_DIR`) live in `shared/apiExplorer.ts` rather than in the service, because the renderer and the IPC types need them.
- T-10 result (built app over CDP, port 9333, 1440×900, oms-core and the exchange simulator from the running Docker stack; the user closed their cockpit first because it holds port 9321):
  - The Commands tab listed all 9 starter templates under their 7 command types; there were no template problems.
  - "INTC limit buy" sent twice → 201 and 201. History holds the resolved bodies, with `clOrdId`s `32b65ce3-…` and `6df9ef7f-…` (distinct), `sendingTime` equal to the send time, `sessionId` `cockpit` and `account` `account-01`. The second order's follow-up showed v1 NEW_ORDER/UNACK, v2 ACK/LIVE, v3 FILL/FILLED: accepted and filled, not rejected.
  - **Use as template** on that order gave an OrderCreateCmd with `{{$guid}}`/`{{$datetime iso8601}}`.
  - Save as template → new file `runtime-check.http`: the dialog closed, and the file held `@baseUrl` plus the named block. The template appeared in the list via the watcher, then disappeared after the file was deleted.
  - There were no console errors and no horizontal overflow; screenshots were inspected.
  - Seen in the check: Use as template listed fields in the query API's (alphabetical) order. It now follows the contract's field order, and the unit test asserts that; the change came after the runtime check.
