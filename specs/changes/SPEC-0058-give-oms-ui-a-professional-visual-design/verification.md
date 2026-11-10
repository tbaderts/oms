# Verification — SPEC-0058: Give oms-ui a professional visual design

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Every test named below ran and passed in the latest `spec verify` (2026-11-10T06:49Z):
- oms-ui: 22 suites, 173 tests (`evidence/oms-ui-1.log`);
- oms-core: `./gradlew check`, 654 tests, 1 skipped, 0 failures (`evidence/oms-core-1.log`).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | No colour or font-size literal outside `_tokens.scss`; `tokens.ts` mirrors it | `theme/styleRules.test.ts` › "uses only colour tokens outside the token file" (hex; every CSS colour function including `hwb`/`lab`/`oklch`/`color-mix`; named colours as values), "uses only font-size tokens" (plus the `font:` shorthand), "tokens.ts mirrors _tokens.scss". The patterns were checked against planted literals (4 caught) and legitimate values (6 spared). Red baseline before the restyle: 104 colour and 74 font-size literals (tasks.md Notes) | PASS |
| AC-2 | WCAG contrast: body text ≥ 4.5:1, muted and badge text ≥ 3:1; no VS Code value | `theme/contrast.test.ts` › "body text meets 4.5:1 on every surface", "the text on the accent button meets 4.5:1", "muted and badge text meet 3:1" (each tone over its tint composited on the page), "no VS Code palette value remains" | PASS |
| AC-3 | Enum labels are words; field names unchanged | oms-core `MetamodelServiceTest#enumLabelsAreWords`: Buy, Sell Short, Market On Close, Good Till Cancel, CXL, ETF, OK To Cross; `orderQty` → "Order Qty". It failed with "B U Y" before the change. The live API on 8080 returns `["Buy","Sell","Sell Short","Subscribe","Redeem"]` for side. The AC's own examples `GTC` and `PARTIALLY_FILLED` are not constants in the schema; the test uses equivalents | PASS |
| AC-4 | Badges show the label as given, value class for colour, no uppercase or letter spacing | `EnumCellRenderer.test.tsx` › "shows the label as given with a value class" ("Sell Short", `enum-cell enum-sell-short`); `styleRules` › "badges are not uppercased or letter-spaced". After the review, the detail modal's badges also render through `EnumCellRenderer`: `DetailPanel.test.tsx` › "shows the metamodel labels as the grid badges do", "falls back to the value without a metamodel label" | PASS |
| AC-5 | Modal titled "Order details"; section headers show SVG icons, no abbreviations | `DetailPanel.test.tsx` › "section headers show an icon, not an abbreviation" (every header holds an `svg[aria-hidden]` and only its title; none of the ten abbreviations rendered); `DetailModal.test.tsx` › "titles the modal by the singular object", "closes from the header icon button, which has a name"; `Blotter.test.tsx` › "opens the detail modal titled by the singular object" (the real wiring: "Execution details"); `icons/Icon.test.tsx` (21 icons) | PASS |
| AC-6 | Footer shows the current year on the surface colour | `App.footer.test.tsx` › "shows the current year" (clock at 2031: "© 2031 Acme Capital · OMS Admin Tool"); `styleRules` › "the footer sits on the surface colour" | PASS |
| AC-7 | `App.css` gone; every stylesheet imported; no dead rules | `styleRules` › "every stylesheet is imported" (also asserts `App.css` is absent), "no rule targets a class nothing renders" (it found `.navbar` and the rest of `App.css`, `.brand-logo`, `.modal-icon` ×3, `.toolbar-icon` and `.empty-state`, all removed). The reviewer re-ran a stricter, string-literal-only version: no dead class | PASS |
| AC-8 | Columns fill the panel width (±2 px); page-size selector spaced and styled | `measurements/ac-8-layout.json`, measured in Chrome on the production build at 1,867 px. Paging orders: 1,808 of 1,808 px; live orders 1,808 of 1,808; live executions 1,818 of 1,818 (difference 0). "Rows per page" sits 8 px from its select. Before the review fix the paging grid ended at 1,460 of 1,818 px. Wiring tests: `Blotter.test.tsx` › "fits the columns to the grid width…", "hands the grid the same column definitions on every render"; `StreamingBlotter.test.tsx` › "fits the columns to the grid width instead of auto-sizing an empty grid" | PASS |
| AC-9 | Requester signs off before/after screenshots | Ticket log, 2026-11-10 06:52: the requester reviewed `screenshots/before` (4 views), `screenshots/after` (7 views) and the running app, and answered "Sign off". That accepted, explicitly, "Day" in normal case and the mixed state labels | PASS |

## Goal Assessment

The goal asks for these things, and each is delivered:
- **An own palette and type scale through tokens.** Slate neutrals and the logo's green, six sizes,
  enforced by tests.
- **Real SVG iconography.** 21 icons; no text stands in for one.
- **Readable status badges.** In the grids and in the detail modal, from oms-core labels.
- **A reworked header and footer.**
- **Finished controls.** The styled "Rows per page" selector; icon close and remove buttons.
- **Grids that fill the panel.**
- **Dead styles removed.**
- **Verification with screenshots and the requester's sign-off.**

Gaps a requester should know:
- **The before set has 4 of the 7 views.** It was taken before any change. The filter builder,
  column selector and authorise modal have after screenshots only.
- **Literals outside stylesheets remain** (outside AC-1's scope):
  - `AcmeLogo.tsx`: its default colour and the green stroke, which is the logo itself;
  - `agGridTheme.ts`: the grid's `fontSize: 13` and `headerFontSize: 12`.
- **Dark only.** A light theme is out of scope; the tokens are the seam for it.
- **The proposal's "DAY stays uppercase" assumption was not followed.** The design used an explicit
  acronym list instead, and the requester accepted the result at sign-off.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No OpenAPI or Avro change |
| P-02 | Specification before code, generated models only | N/A | The metamodel endpoint is hand-written, not generated; no model change |
| P-03 | Never edit generated code | PASS | Nothing under `build/generated*` touched |
| P-04 | Contracts evolve compatibly | PASS | The metamodel response keeps its shape; only label strings change. No other reader (grep across oms-mcp-server and oms-streaming-service) |
| P-05 | Every state change is recorded in the event log | N/A | No state change |
| P-06 | Kafka only through the transactional outbox | N/A | Nothing published |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database change |
| P-08 | Concurrency and idempotency are explicit | N/A | Presentation only |
| P-09 | Commands and queries stay separate | N/A | Read-only metadata |
| P-10 | State transitions go through the state machine and task pipeline | N/A | None |
| P-11 | Layering and conventions | PASS | Tokens and grid sizing in `theme/`, icons in `components/icons/`, label formatting in oms-core's `MetamodelService` |
| P-12 | Jackson 3 only | N/A | No JSON mapping change |
| P-13 | Errors and validation follow the framework specs | N/A | No API change |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | AC-1 to AC-7: each test was seen failing first (T-2 baseline; the label test failed on "B U Y"; the badge, title and sizing tests were red before their fixes). AC-8 was measured and AC-9 signed off, as the approved proposal states |
| P-15 | Observability | N/A | Presentation only |
| P-16 | Security | PASS | No secrets; the SVG is static markup, nothing user-supplied is rendered as SVG |
| P-17 | Simplicity and dependencies | PASS | No new dependency (no icon library, no stylelint, no web font) |
| P-18 | Modules build standalone | PASS | oms-ui (`npm test`, `gradlew check`) and oms-core (`gradlew check`) each pass |
| P-19 | Documentation follows behaviour | PASS | `ui/oms-admin-ui_spec.md`: a new "Visual design" section; the footer, page structure, buttons, rows-per-page values and the stale wireframe footer line are updated |

## Independent Review

The spec-reviewer returned **NOT MET**. Each finding was fixed (T-15) before the final
`spec verify`, or is recorded:

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | major | The detail modal showed raw codes as uppercase, letter-spaced badges ("SELL_SHORT"), in colours that differed from the grid | `DetailPanel` renders `side`, `ordType`, `state`, `cancelState` and `timeInForce` through `EnumCellRenderer` with the metamodel label; its own badge colour maps and `.badge` styles are removed. Two new tests; after screenshot 04 replaced ("Sell", "Limit", "Filled") |
| 2 | major | No AC-8 measurement after the fix was recorded | `measurements/ac-8-layout.json` (difference 0 px in all three grids; gap 8 px), cited above |
| 3 | minor | Duplicate `Arrays`/`Locale` imports in `MetamodelService` | Removed |
| 4 | minor | Style-rule regex gaps (named colours, other colour functions, `font:` shorthand) | Closed and checked against planted literals; nothing slipped through before |
| 5 | minor | Literals outside stylesheets (`AcmeLogo`, AG Grid font sizes) | Outside AC-1; recorded under Follow-ups |
| 6 | minor | Stale "© 2025" line in the KB wireframe | Updated |
| 7 | minor | `rowHeight`/`headerHeight` props overrode the theme | Removed; rows are the theme's 30 px |
| 8 | minor | "DAY stays uppercase" assumption versus the design's acronym list | Noted in the Goal Assessment; accepted at sign-off |
| — | minor (weak test) | The modal title test passed the title straight in | Added a blotter test that opens the modal and reads "Execution details" |

A second review was not run. The one major code finding is covered by new tests that fail without
the fix, and all other findings were documentation or minor.

## Automated Evidence

`spec verify SPEC-0058` ran at 2026-11-10T06:49:41Z with result **pass** (fingerprint
`374ac657ce7c6292`).

| Module | Command | Exit | Time | Log |
|---|---|---|---|---|
| oms-ui | `npm test -- --watchAll=false --passWithNoTests` | 0 | 12 s | `evidence/oms-ui-1.log` (22 suites, 173 tests) |
| oms-ui | `..\gradlew.bat -p .. check` | 0 | 44 s | `evidence/oms-ui-2.log` |
| oms-core | `.\gradlew.bat check` | 0 | 394 s | `evidence/oms-core-1.log` (654 tests, 1 skipped) |

The policy check passed. An earlier run (06:18Z) failed in oms-core because the test JVM ran out of
native memory on the busy machine, not because of a test failure; this re-run passed. The peer
session in the tree held its edits during the run.

## Follow-ups

- **Literals outside stylesheets.**
  - Take the grid's font sizes (`agGridTheme.ts`) from the type scale.
  - Decide whether `AcmeLogo`'s colours become tokens.
  - Optionally extend the style scan to inline TSX styles.
- **Trim `AllCommunityModule`** to the exact AG Grid modules once a check for a missing module
  exists (SPEC-0057 follow-up; 114 kB gzipped).
- **The detail modal's other fields** (dates, numbers) still use the panel's own formatting, not
  the grid's formatters.
- **Commit order.** `StreamingBlotter.tsx` carries both SPEC-0057 and SPEC-0058 changes. Commit
  them together, or SPEC-0057 first (design → "Shared file with SPEC-0057").

## Verdict

Verdict: GOAL MET
