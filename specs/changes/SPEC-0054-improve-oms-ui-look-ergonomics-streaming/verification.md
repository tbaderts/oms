# Verification — SPEC-0054: Improve oms-ui look, ergonomics, streaming limits

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Streaming blotter holds exactly N rows (oldest evicted) and the toolbar record count shows N | `rollingWindow.test.ts` (4 tests), `StreamingBlotter.test.tsx#caps rows at maxStreamingRows, evicting the oldest` — asserts rowData length, evicted row ids and the toolbar record count (evidence/oms-ui-1.log) | PASS |
| AC-2 | Window limit from /api/config (1500 -> 1500; missing/<=0/non-numeric -> 2000) | `StreamingBlotter.test.tsx#reads maxStreamingRows from config`, `#falls back to the default when config is missing or invalid`; `ConfigService.test.ts` (6 tests) exercises the real `getMaxStreamingRows()` sanitizer against 1500 / missing / 0 / -5 / 'x' / no-config (evidence/oms-ui-1.log) | PASS |
| AC-3 | Switching to paging mode unsubscribes the stream; REST blotter fetches with page/size | `StreamingBlotter.test.tsx#unsubscribes the stream on unmount` (unmount -> `unsubscribe()` called); `Blotter.test.tsx#fetches with page and size params` (page 0 then page 1, size 100). The header toggle is the single switch: the streaming blotter's "REST Mode" button and `onModeChange` plumbing were removed (Finding 2) | PASS |
| AC-4 | Page size S from the selector reaches the API as size=S, page=p-1; changing S resets to page 1 | `Blotter.test.tsx#uses the selected page size` (250), `#resets to the first page when the page size changes` (page 1 -> size 500 -> page 0). Selector options 50/100/250/500 rendered in the pagination bar; selection persisted via `BlotterStateService` | PASS |
| AC-5 | Partial last page renders its remaining rows | `Blotter.test.tsx#renders the partial last page` — 250 total, size 100, page index 2 shows 50 rows from the paged mock (evidence/oms-ui-1.log) | PASS |
| AC-6 | No emoji glyphs in app shell or blotter toolbars; shared design-token classes | `App.test.js#noEmojiInControls` (header/tabs/footer), `Blotter.test.tsx#noEmojiInControls` (toolbar + pagination), `StreamingBlotter.test.tsx#noEmojiInToolbar` (toolbar + status bar) — all assert no emoji code points in rendered text. Status is a CSS `.status-dot` coloured by token classes. All SCSS migrated to `--oms-*` tokens (`theme/_tokens.scss`); AG Grid theme reads `theme/tokens.ts` | PASS |
| AC-7 | After a connection error and reconnect, the window is reset and the stream re-subscribes | `StreamingBlotter.test.tsx#resets the window and event counter and re-subscribes on reconnect` — asserts `subscribeToExecutions` called again after Retry, rowData reset to 0 and `Events: 0`. Fixed the underlying bug: `handleReconnect` now bumps `reconnectTick` so the subscribe effect re-runs (Finding 1) | PASS |

## Goal Assessment

The goal asked for four things: a configurable memory limit (a few thousand max) for streaming, a
rolling window in real-time mode, a paging mode with configurable page size giving access to all
data, and a more professional look. All four are delivered and tested:

- **Configurable limit**: `maxStreamingRows` on `/api/config` (default 2000, server property
  `oms.ui.max-streaming-rows`), sanitized on the frontend; invalid values fall back to the default.
- **Rolling window**: oldest-by-arrival eviction on every insert, in both order and execution
  streaming blotters; reconnect resets the window and re-subscribes.
- **Paging mode**: page-size selector (50/100/250/500, persisted per blotter), partial last page
  rendered, all data reachable page by page.
- **Professional look**: design-token theme across the app shell and components, emoji glyphs
  replaced with text labels and CSS status dots, enforced by DOM-assertion tests.

Honest gaps (accepted, not hidden): the "showing N of M events" indicator mentioned in the design's
risk section was not implemented — the toolbar shows the windowed record count only; the mode
switch is exercised at the component level (unmount -> unsubscribe, REST fetch with page/size) but
there is no end-to-end test clicking the header toggle. Neither gap contradicts an AC.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | PASS | No contract file touched; `/api/config` is a Spring controller in oms-ui, not a contract |
| P-02 | Specification before code, generated models only | N/A | No API or message change; nothing to regenerate |
| P-03 | Never edit generated code | PASS | No generated code touched |
| P-04 | Contracts evolve compatibly | PASS | Additive optional `maxStreamingRows` key on a non-contract endpoint; consumers unaffected |
| P-05 | Every state change is recorded in the event log | N/A | Read-path only; no state change |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka producer/consumer change |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change |
| P-08 | Concurrency and idempotency are explicit | N/A | No command path touched |
| P-09 | Commands and queries stay separate | PASS | UI consumes the read-only query API; no write path added |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state touched |
| P-11 | Layering and conventions | PASS | Follows the existing component/service split (`rollingWindow.ts` helper, token theme module) |
| P-12 | Jackson 3 only | N/A | Frontend TypeScript; no Java serialization change |
| P-13 | Errors and validation follow the framework specs | PASS | Config sanitization follows the existing `ConfigService` fallback pattern |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | All 7 ACs proven by Jest/RTL tests; 65 tests green in the verify run. The reviewer's initial P-14 concerns (untested sanitizer, vacuous AC-7 test, missing App shell test) were fixed |
| P-15 | Observability | PASS | Frontend console logging follows the existing `[Component] message` convention; eviction is silent by design (a per-event log line would itself be noise) |
| P-16 | Security | PASS | No secrets; the only new input is a numeric config field that is sanitized |
| P-17 | Simplicity and dependencies | PASS | No new npm dependency; smallest change per AC; rejected alternatives recorded in design.md |
| P-18 | Modules build standalone | PASS | oms-ui module verify now runs both `npm test` (frontend) and `gradlew.bat -p .. check` (backend); both exit 0 in the verify run |
| P-19 | Documentation follows behaviour | PASS | `oms-knowledge-base/ui/oms-admin-ui_spec.md` documents `maxStreamingRows` (default 2000), the mode-switch semantics and page sizes 50/100/250/500 |

## Independent Review

The spec-reviewer agent (fresh context, skeptical brief) returned **NOT MET** with 10 findings.
Resolution:

1. **[blocking] Reconnect does not re-subscribe** — confirmed real. `handleReconnect` now bumps a
   `reconnectTick` state so the subscribe effect re-runs after a successful reconnect, and the
   AC-7 test asserts `subscribeToExecutions` is called again. **Fixed.**
2. **[major] "REST Mode" button still exists** — confirmed; contradicted the design decision.
   Removed the button, the `onModeChange` prop plumbing and the `.mode-switch-button` SCSS; the
   header toggle is the single switch. **Fixed.**
3. **[major] ConfigService sanitizer untested** — added `ConfigService.test.ts` (6 tests) against
   the real `getMaxStreamingRows()`. **Fixed.**
4. **[major] verification.md unfilled** — this document. **Fixed.**
5. **[minor] AC-1 record count not asserted** — the test now asserts the toolbar record count. The
   "N of M" indicator from the design's risk section was dropped (recorded under Goal Assessment).
   **Fixed.**
6. **[minor] `App.test.js#noEmojiInControls` missing** — added. **Fixed.**
7. **[minor] AG Grid theme hard-codes hex values** — added `theme/tokens.ts` (TS mirror of the
   SCSS tokens) and made `agGridTheme.ts` read from it. **Fixed.**
8. **[minor] Streaming blotter clobbers persisted pageSize/currentPage** — the save effect now
   preserves the saved `sortModel`/`pageSize`/`currentPage` and writes only filters/columns.
   **Fixed.**
9. **[minor] Backend change unverified by automated evidence** — added `gradlew.bat -p .. check`
   to the oms-ui module verify commands in `specs/config.json`; it runs and passes in the verify
   run. **Fixed.**
10. **[minor] AC-5 test tautological / deviates from design scenario** — the test now drives the
    mock from the requested page (250 total, size 100, last page 50 rows), so the assertion checks
    what the component rendered for a genuinely partial page. **Fixed.**

## Automated Evidence

`evidence/last-run.json` (2026-11-08, after the last code change):

- Policy check (changes since main, merge-base 9263c597): **PASS** (one advisory warning,
  `[R07 P-14]`, superseded by the test coverage added during review — see P-14 above).
- `[oms-ui] npm test -- --watchAll=false --passWithNoTests` — exit 0; 13 suites, **65 tests,
  all passing** (evidence/oms-ui-1.log).
- `[oms-ui] ..\gradlew.bat -p .. check` — exit 0; backend build, tests and check pass
  (evidence/oms-ui-2.log).

## Follow-ups

- "Showing N of M events" indicator when the streaming window is full (dropped from this ticket;
  small, self-contained).
- End-to-end test of the header mode toggle (streaming -> REST -> streaming) in a browser context.

## Verdict

Verdict: GOAL MET
