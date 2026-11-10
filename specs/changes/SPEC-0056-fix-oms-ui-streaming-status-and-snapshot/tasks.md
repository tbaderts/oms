# Tasks — SPEC-0056: Fix oms-ui streaming status and snapshot reloads

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

- [x] **T-1** Status from the first render: test `shows the shared connection's current state when it mounts` (red), then read `getConnectionState()` when registering the listener (AC-1)
  - files: oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/StreamingBlotter.test.tsx` passes
- [x] **T-2** Keep visited views mounted: tests `switching tabs and modes subscribes each live blotter once` and `a hidden live blotter keeps receiving events` in `App.test.js` (red), then `App.tsx` renders visited views hidden instead of unmounting them (AC-2, AC-3)
  - files: oms-ui/frontend/src/App.tsx, oms-ui/frontend/src/App.test.js
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/App.test.js` passes
- [x] **T-3** Re-subscription stays explicit: test `re-subscribes with a snapshot when filters or the snapshot option change` (AC-4)
  - files: oms-ui/frontend/src/components/StreamingBlotter.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false src/components/StreamingBlotter.test.tsx` passes
- [x] **T-4** History-only columns: `config/streamedFields.json`, `services/streamedFields.ts` with `streamedFields.test.ts`; tests `live and paging blotters show the same default columns` and `hides history-only columns with a note` (red); then `StreamingBlotter` builds live columns, shows the note and merges selections; `ColumnSelector` takes `availableFields` (AC-5, AC-6)
  - files: oms-ui/frontend/src/config/streamedFields.json, oms-ui/frontend/src/services/streamedFields.ts, oms-ui/frontend/src/services/streamedFields.test.ts, oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx, oms-ui/frontend/src/components/ColumnSelector.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false` passes
- [x] **T-5** Streaming-service guards: `StreamedFieldsTest` (listed fields are DTO properties) and `OrderMessageMapperTest#orderDtoCarriesAllBlotterDefaultColumns` (AC-5, AC-6)
  - files: oms-streaming-service/src/test/java/org/example/streaming/model/StreamedFieldsTest.java, oms-streaming-service/src/test/java/org/example/streaming/mapper/OrderMessageMapperTest.java
  - verify: `cd oms-streaming-service && ./gradlew test` passes
- [x] **T-6** Update `ui/oms-admin-ui_spec.md`: live status, views kept mounted, history-only columns (AC-1, AC-2, AC-6)
  - files: oms-knowledge-base/ui/oms-admin-ui_spec.md
  - verify: grep finds `History only` and `kept mounted` in oms-admin-ui_spec.md
- [x] **T-7** Run spec verify (agree a quiet window with other sessions first)
  - verify: `node specs/tools/spec.mjs verify SPEC-0056` exits 0

- [x] **T-8** From the independent review: `active` prop from App; a blotter becoming active re-reads saved columns and filters, only the active one saves, a paging blotter auto-refreshes only while active; every live blotter re-subscribes on a transition to connected when its subscription is dead; drop `creationDate` and `securityType` from the streamed list and make `StreamedFieldsTest` assert listed fields are filled; tests first (AC-1, AC-5, AC-6)
  - files: oms-ui/frontend/src/App.tsx, oms-ui/frontend/src/App.keepMounted.test.tsx, oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx, oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/Blotter.test.tsx, oms-ui/frontend/src/components/StreamingOrderBlotter.tsx, oms-ui/frontend/src/components/StreamingExecutionBlotter.tsx, oms-ui/frontend/src/components/OrderBlotter.tsx, oms-ui/frontend/src/components/ExecutionBlotter.tsx, oms-ui/frontend/src/config/streamedFields.json, oms-streaming-service/src/test/java/org/example/streaming/model/StreamedFieldsTest.java
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false` passes and `cd oms-streaming-service && ./gradlew test` passes
- [x] **T-9** Rerun spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0056` exits 0
- [x] **T-10** From the second independent review: the paging blotter saves only after its initial read; the subscribe effect clears the resubscribe flag, ignores a superseded run and sets the flag when its connect fails; filters compared in the saved form (`sameSavedFilters`); persisting state mocks and tests for each; knowledge base describes shared state and every re-subscribe trigger; tests first (AC-2, AC-4, AC-6)
  - files: oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/Blotter.test.tsx, oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx, oms-ui/frontend/src/App.keepMounted.test.tsx, oms-ui/frontend/src/services/filterUtils.ts, oms-ui/frontend/src/services/filterUtils.test.ts, oms-knowledge-base/ui/oms-admin-ui_spec.md
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false` passes
- [x] **T-11** Rerun spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0056` exits 0
- [x] **T-12** From the third independent review: the paging blotter starts on page 1 when the saved `currentPage` is 0 (the live blotter saves no paging); reset `mockSubscriptionActive` per test; test first (AC-6)
  - files: oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/Blotter.test.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx
  - verify: `cd oms-ui/frontend && CI=true npm test -- --watchAll=false` passes
- [x] **T-13** Rerun spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0056` exits 0
- [x] **T-14** Found in the browser after done: the `.blotter-view` wrapper had no height, so the blotter's `height: 100%` collapsed and the grid was 1.6 px tall (no rows visible). Give the wrapper `height: 100%` (AC-2, AC-3)
  - files: oms-ui/frontend/src/App.scss
  - verify: in the dev build (port 3001), live Orders, live Executions and REST Executions each show a grid of about 520–540 px with rows. jsdom does no layout, so no unit test can see this
- [x] **T-15** Rerun spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0056` exits 0

## Notes

- oms-ui tests run with react-scripts (Jest); `CI=true` avoids watch mode.
