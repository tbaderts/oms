# Tasks — SPEC-0054: Improve oms-ui look, ergonomics, streaming limits

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

- [x] **T-1** Add `maxStreamingRows` to the oms-ui config endpoint and frontend `ConfigService` (AC-2)
  - files: oms-ui/src/main/java/org/example/omsui/controller/ConfigController.java, oms-ui/frontend/src/services/ConfigService.ts
  - verify: `cd oms-ui && ./gradlew check` passes and `ConfigService.getMaxStreamingRows()` returns 1500 for config `{maxStreamingRows: 1500}` and 2000 for `{}` / `{maxStreamingRows: 0}` / `{maxStreamingRows: 'x'}`

- [x] **T-2** Write the failing unit test for the rolling-window helper, then implement `services/rollingWindow.ts` (AC-1)
  - files: oms-ui/frontend/src/services/rollingWindow.ts, oms-ui/frontend/src/services/rollingWindow.test.ts
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false rollingWindow` passes — `evictOldest` keeps the newest N keys and drops the first-inserted ones

- [x] **T-3** Streaming blotter caps rows at the configured limit (AC-1, AC-2)
  - files: oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false StreamingBlotter` passes — new tests `capsRowsAtMaxStreamingRows`, `readsMaxStreamingRowsFromConfig`, `fallsBackToDefaultOnBadConfig` are green

- [x] **T-4** Streaming blotter resets window and event counter on reconnect (AC-7)
  - files: oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false StreamingBlotter` passes — new test `resetsWindowOnReconnect` is green

- [x] **T-5** Mode switch unsubscribes the stream on unmount (AC-3)
  - files: oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false StreamingBlotter` passes — new test `unsubscribesOnUnmount` is green

- [x] **T-6** REST blotter fetches with `page`/`size` params and honours the selected page size (AC-3, AC-4)
  - files: oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/Blotter.test.tsx
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false Blotter` passes — new tests `fetchesWithPageAndSizeParams`, `usesSelectedPageSize`, `resetsToFirstPageOnPageSizeChange` are green

- [x] **T-7** REST blotter renders the partial last page (AC-5)
  - files: oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/Blotter.test.tsx
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false Blotter` passes — new test `rendersPartialLastPage` is green

- [x] **T-8** Page-size selector UI in the pagination bar, persisted via `BlotterStateService` (AC-4)
  - files: oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/Blotter.scss
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false Blotter` passes and the selector renders with options 50/100/250/500

- [x] **T-9** Design-token theme: add `theme/_tokens.scss`, wire into `index.tsx`, migrate `App.scss` and component SCSS to tokens (AC-6)
  - files: oms-ui/frontend/src/theme/_tokens.scss, oms-ui/frontend/src/index.tsx, oms-ui/frontend/src/App.scss, oms-ui/frontend/src/components/*.scss
  - verify: `cd oms-ui/frontend && npm run build` passes and `grep -rE "🀀|📡|📋|🔍|📊|↔️|⏮|▶|⏭|🟢|🟡|🔴|⚪" src/components src/App.scss` finds no emoji in toolbars/buttons

- [x] **T-10** Replace emoji glyphs with text labels and CSS status dots in app shell and blotter toolbars (AC-6)
  - files: oms-ui/frontend/src/App.tsx, oms-ui/frontend/src/components/StreamingBlotter.tsx, oms-ui/frontend/src/components/Blotter.tsx, oms-ui/frontend/src/components/StreamingBlotter.test.tsx, oms-ui/frontend/src/App.test.js
  - verify: `cd oms-ui/frontend && npm test -- --watchAll=false` passes — new tests `noEmojiInToolbar` (StreamingBlotter) and `noEmojiInControls` (App) are green

- [x] **T-11** Update `oms-knowledge-base/ui/oms-admin-ui_spec.md` with rolling window, mode switch and page-size behaviour (P-19)
  - files: oms-knowledge-base/ui/oms-admin-ui_spec.md
  - verify: the page documents `maxStreamingRows` (default 2000), the real-time ↔ paging switch semantics and page sizes 50/100/250/500

- [x] **T-12** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0054` exits 0

## Notes

- No contracts, Liquibase or Kafka tasks: the design rules those phases out (read-path only).
- T-1 is the only oms-ui backend change (one `@Value` field); everything else is frontend.
- T-9 and T-10 are split so the token migration (mechanical) is separate from the glyph
  replacement (behaviour-adjacent, tested).
