# Design — SPEC-0058: Give oms-ui a professional visual design

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

**oms-ui styling today** (`oms-ui/frontend/src`):
- **Tokens.**
  - `theme/_tokens.scss` declares CSS custom properties on `:root`: VS Code's palette renamed
    (`--oms-bg: #1e1e1e`, `--oms-accent: #007acc`, syntax colours), plus spacing, radius and
    font-size tokens that no rule uses.
  - `theme/tokens.ts` mirrors a few values by hand for `theme/agGridTheme.ts` (AG Grid Theming
    API).
- **Literals.** Nine stylesheets: `App.scss`, `index.css`, `components/{Blotter, FilterBuilder,
  ColumnSelector, DetailModal, DetailPanel, AuthorizeModal, EnumCellRenderer}.scss`, plus the
  dead `App.css`. Together they hold 74 font-size literals (10 distinct sizes) and 104 colour
  literals (about 60 distinct).
- **Badges.** `components/EnumCellRenderer` renders `valueFormatted` (the metamodel enum label) in
  a span with class `enum-<value>`. `EnumCellRenderer.scss` sets `text-transform: uppercase` and
  hard-coded colours per value.
- **Detail modal.**
  - `components/DetailPanel.tsx` groups fields under `fieldGroups[...].icon` strings ("ID",
    "INST", …), rendered in `.section-icon`.
  - `DetailModal` receives `title={metadata.displayName}` ("Orders") and shows "<title> Details".
- **Header, tabs, mode switch and footer** are in `App.tsx` / `App.scss`. The footer is
  hard-coded "© 2025 Acme Capital OMS" on `--oms-accent`.
- **Grid sizing.** Both blotters call `api.autoSizeAllColumns()` in `onGridReady`, before there are
  rows, so columns size to their headers and leave the panel half empty.
- **Page-size selector.** `Blotter.tsx`'s `label.page-size-selector` wraps a native `select`
  without spacing or styling.

**oms-core** (`service/MetamodelService.java`): `extractEnumValues` labels each constant with
`formatDisplayName(name)`. That is a camelCase splitter that inserts a space before each capital,
so `BUY → "B U Y"`. `MetamodelServiceTest` covers the Order and Execution metamodels.

**Examples followed:**
- the SPEC-0054 no-emoji tests (a source scan run by Jest) for the style rules;
- `MetamodelServiceTest` for the label test;
- the AG Grid theme that SPEC-0054 already builds from `tokens.ts`.

**Read:** `ui/oms-admin-ui_spec.md`, `oms-framework/testing-patterns.md`.

## Approach

### 1. Tokens: palette, type scale, shape (`theme/_tokens.scss`, `theme/tokens.ts`)

Slate neutrals, with the logo's green (`#22c55e`) as the brand accent:

| Token | Value | Use |
|---|---|---|
| `--oms-bg` | `#0e1318` | page |
| `--oms-surface` | `#141a21` | panels, footer |
| `--oms-surface-raised` | `#1a222b` | toolbars, grid header, inputs |
| `--oms-surface-overlay` | `#212b36` | modals, menus |
| `--oms-border` | `#273240` | dividers |
| `--oms-border-strong` | `#364354` | input borders, focus-less outlines |
| `--oms-hover` | `#1c2530` | row and button hover |
| `--oms-selection` | `#16362a` | selected row |
| `--oms-text` | `#d5dce4` | body text |
| `--oms-text-muted` | `#8c99a8` | secondary text |
| `--oms-text-strong` | `#f2f5f8` | headings |
| `--oms-text-on-accent` | `#06140c` | text on the green button |
| `--oms-accent` | `#22c55e` | brand, primary actions, active tab |
| `--oms-accent-hover` | `#3fd477` | |
| `--oms-accent-bg` | `rgba(34, 197, 94, 0.14)` | accent tint |
| `--oms-success` / `-bg` | `#4ade80` / `rgba(74, 222, 128, 0.14)` | |
| `--oms-warning` / `-bg` | `#f5b544` / `rgba(245, 181, 68, 0.14)` | |
| `--oms-danger` / `-bg` | `#f87171` / `rgba(248, 113, 113, 0.14)` | |
| `--oms-info` / `-bg` | `#60a5fa` / `rgba(96, 165, 250, 0.14)` | |
| `--oms-neutral` / `-bg` | `#94a3b8` / `rgba(148, 163, 184, 0.14)` | |
| `--oms-violet` / `-bg` | `#c4a5fd` / `rgba(196, 165, 253, 0.14)` | order types |
| `--oms-orange` / `-bg` | `#fdba74` / `rgba(253, 186, 116, 0.14)` | stop orders |
| `--oms-teal` / `-bg` | `#5eead4` / `rgba(94, 234, 212, 0.14)` | time in force |
| `--oms-shadow-md` / `-lg` | `0 4px 12px rgba(0, 0, 0, 0.35)` / `0 16px 40px rgba(0, 0, 0, 0.5)` | menus, modals |
| `--oms-scrim` | `rgba(5, 8, 11, 0.7)` | modal backdrop |
| syntax `--oms-syntax-*` | retuned to the palette (`info`, `success`, `warning`, `violet`, `text`) | JSON viewer |

- **Type scale:** six sizes.
  - `--oms-font-size-2xs` 0.6875rem (11 px)
  - `--oms-font-size-xs` 0.75rem
  - `--oms-font-size-sm` 0.8125rem
  - `--oms-font-size-md` 0.875rem
  - `--oms-font-size-lg` 1rem
  - `--oms-font-size-xl` 1.25rem
  - Every literal maps to the nearest of these: 1.5rem and 1.125rem become `xl` and `lg`; 0.7rem
    and 0.85rem become `2xs` and `sm`.
  - `--oms-font-family` is the system UI stack. `--oms-font-mono` is for ids and JSON.
    `font-variant-numeric: tabular-nums` applies to the grids and numeric fields.
- **Spacing:** `--oms-space-1` to `-6` (0.25 to 2rem).
- **Radii:** `--oms-radius-sm/md/lg` (3/6/10 px).
- **Mirror:** `tokens.ts` mirrors every token AG Grid needs. Its keys are the camelCase of the
  CSS name (`surfaceRaised` ↔ `--oms-surface-raised`). A test enforces equal values (AC-1).
- **AG Grid theme:** `agGridTheme.ts` keeps `themeQuartz` but takes `colorSchemeDark`, not
  `colorSchemeDarkBlue`.
  - Parameters come from the new tokens: header on `surfaceRaised`, accent green, selection,
    border, `fontSize` 13, `headerFontSize` 12, `rowHeight` 30.
  - The cell-change flash is `accentBg`.

### 2. Every stylesheet on tokens

All nine stylesheets are rewritten against the tokens.
- **Literals.** No hex, `rgb()`, `rgba()` or `hsl()`, and no `font-size` other than
  `var(--oms-font-size-*)`, outside `_tokens.scss`. Spacing and radius use tokens where they
  repeat. One-off pixel layout values (widths, 1 px borders) may stay; AC-1 governs only colour
  and font size.
- `App.css` is deleted.
- **Dead rules.** Rules for classes no component renders are removed. Found so far: `App.css`
  entirely. The rest is found by the dead-rule scan (AC-7) and removed in the same task.

### 3. Readable badges (oms-core + `EnumCellRenderer`)

- **oms-core:** a new `MetamodelService.formatEnumLabel(String constant)`.
  - The constant is split on `_`.
  - Each word in the acronym set `{ISIN, RIC, CLI, MKT, CS, FUT, OPT, ETF, ETN, MF, CXL, PCXL, PMOD,
    REJ, EXP, OK, GTC, IOC, FOK}` stays uppercase; every other word becomes Title case.
  - Words join with a space: `BUY → Buy`, `SELL_SHORT → Sell Short`, `GOOD_TILL_CANCEL → Good Till
    Cancel`, `OK_TO_CROSS → OK To Cross`, `CXL → CXL`, `ETF → ETF`.
  - `extractEnumValues` uses it. `formatDisplayName` stays for field names.
- **oms-ui:** `EnumCellRenderer` is unchanged in logic and shows the label as given.
  `EnumCellRenderer.scss` drops `text-transform` and the letter spacing.
  - Badges are pills: radius `--oms-radius-sm`, font `--oms-font-size-xs`, weight 600, padding
    2 × 8 px.
  - Colour comes from semantic tone tokens:
    - side: buy → success, sell and sell short → danger, subscribe and redeem → info;
    - state: new, unack and live → info, filled → success, closed and exp → neutral,
      cxl → warning, rej → danger;
    - order type: market → violet, limit → info, stop and stop limit → orange;
    - time in force → teal.

### 4. Icons (`components/icons/Icon.tsx`, new)

- **Component:** one `Icon` component, `<Icon name="clock" size={16} />`, an inline `svg` with a
  24-unit viewBox, `stroke="currentColor"`, `fill="none"`, `strokeWidth 1.75`, round caps,
  `aria-hidden="true"` and `focusable="false"`.
- **Glyphs:** a typed `ICON_PATHS` map with about 20 icons, drawn for this app:
  - section icons: `id`, `instrument`, `order`, `execution`, `status`, `time`, `settlement`,
    `derivative`, `misc`, `unassigned`;
  - controls: `filter`, `columns`, `refresh`, `autosize`, `pause`, `play`, `connect`,
    `disconnect`, `close`, `key`.
- **DetailPanel:** `fieldGroups[...].icon` becomes an `IconName`. The section header renders
  `<Icon name=…/>` and the title, with no text icon.
- **Toolbars:** the toolbar buttons (Filters, Columns, Refresh, Auto-Size, Pause/Resume,
  Connect/Disconnect) and Authorize get a leading icon and keep their text. Accessible names are
  unchanged, so the existing tests that find buttons by name keep working.

### 5. Header, footer, modals, controls, grid sizing

- **Header** (`App.tsx` / `App.scss`):
  - one 52 px bar on `--oms-surface`: logo and "OMS Admin Tool" on the left;
  - the mode switch as a segmented control (REST | Streaming), then Authorize as the primary
    (green) button on the right;
  - the tabs below, on the page background, with a green underline for the active tab.
- **Footer:** a 28 px bar on `--oms-surface`, top border `--oms-border`, muted text "© <current
  year> Acme Capital · OMS Admin Tool". The year is `new Date().getFullYear()`.
- **Modals:**
  - a shared look: overlay `--oms-scrim`, panel `--oms-surface-overlay`, radius
    `--oms-radius-lg`, shadow `--oms-shadow-lg`, header with title and close icon;
  - the detail modal's title is `"<Order|Execution> details"`. The blotters pass the singular
    domain name; `DetailModal` no longer appends " Details".
- **Native controls:** the page-size selector becomes "Rows per page" plus a styled select (token
  background, border, radius, a `gap` from the label). Checkboxes use `accent-color:
  var(--oms-accent)`. Text inputs and selects share one style from tokens.
- **Grid sizing:** both blotters pass a constant `autoSizeStrategy = { type: 'fitGridWidth',
  defaultMinWidth: 110 }`.
  - `onGridReady` no longer calls `autoSizeAllColumns`.
  - `onGridSizeChanged` calls `sizeColumnsToFit()`.
  - The Auto-Size button still fits columns to their contents on demand.

### What Changes → where

| Proposal bullet | Where |
|---|---|
| Own palette and type scale through tokens | `_tokens.scss`, `tokens.ts`, `agGridTheme.ts`, every stylesheet |
| Readable badges | oms-core `MetamodelService.formatEnumLabel`; `EnumCellRenderer.scss` |
| Iconography | `components/icons/Icon.tsx`; `DetailPanel`, toolbars, header |
| Header and footer | `App.tsx`, `App.scss` |
| Controls and layout | `Blotter.tsx`/`StreamingBlotter.tsx` (`autoSizeStrategy`, `onGridSizeChanged`, page-size label), stylesheets |
| Dead styles | delete `App.css`; the dead-rule scan |
| Screenshots and sign-off | `screenshots/before` (done), `screenshots/after` |

### Shared file with SPEC-0057 (changed during implementation)

`StreamingBlotter.tsx` also carries SPEC-0057's uncommitted work: the row store, the snapshot
marker, Pause, and its AC-9 fix (a memoised `AgGridReact` element, `useCallback` grid callbacks,
row animation off).
- **SPEC-0058 kept all of it.** The sizing props (`autoSizeStrategy`, `onGridSizeChanged`,
  `onNewColumnsLoaded`) were added inside the memoised element. They are module constants, so its
  dependency list stays correct.
- **SPEC-0058 removed the `rowHeight`/`headerHeight` overrides**, so the theme's 30 px applies.
- **Both tickets' changes to the file should be committed together, or 0057 first.** SPEC-0057's
  AC-9 and AC-10 are measured on a build that includes this ticket (recorded in its tasks.md).

## Contract Changes

None in oms-contracts. The metamodel REST response (`/api/v1/metamodel/{entity}`, served by
oms-core's `MetamodelController`, not an OpenAPI-generated interface) keeps its shape.
`enumValues[].label` strings change content, for example `"B U Y"` becomes `"Buy"`; `value` is
unchanged. The only reader is oms-ui (oms-mcp-server does not read the metamodel; checked by
grep).

## Data & Persistence

None — no entity, table or migration.

## Events & Messaging

None — no events, outbox or Kafka change.

## Domain, State & Orchestration

None — presentation only; no state machine, task pipeline or validation change.

## Alternatives & Decisions

- **Palette from the logo's green** (approved assumption). Rejected: keeping blue as the brand,
  which is what reads as VS Code.
- **Inline SVG icons, no library** (approved assumption, P-17). Rejected: `lucide-react` or
  similar, a dependency for about 20 glyphs, and an icon font, which has worse accessibility and
  sizing.
- **Enum labels fixed in oms-core.** Rejected: re-formatting labels in oms-ui, which would leave
  the API returning "B U Y" to any other reader and split label logic across modules.
- **An explicit acronym set** for enum labels. Rejected: a length rule ("words of 3 letters or
  fewer stay uppercase"), which would also keep `NEW`, `DAY` and `BUY` uppercase.
- **The style rules are enforced by Jest scans in oms-ui.** They run with `npm test`, which
  `spec verify` already runs. Rejected: stylelint, a new dependency and config for three rules.
- **`fitGridWidth` auto-size strategy.** Rejected:
  - `flex: 1` on every column, which overrides the Auto-Size button and the saved widths;
  - fitting on first data rendered, which needs extra code for the transaction-fed live grid.
- **Dark only** (out of scope). The tokens are the seam for a light theme later.
- **Dependencies:** none.

## Risks & Mitigations

- **A regression in the many tests that find elements by class or text.** Class names stay; button
  names keep their text; the full suite runs in each task.
- **Contrast misjudged by eye.** AC-2 computes the WCAG ratio from the token values.
- **Dead-rule scan false positives:**
  - classes built at run time (`enum-${value}`, `status-${state}`) are exempted by prefix in the
    test, with a comment;
  - SCSS `&-suffix` selectors are not parsed, so they can't produce false alarms (or catch dead
    rules).
- **Label change visible elsewhere.** Saved filters store enum values, not labels, so nothing
  persisted changes.
- **Screenshots in the throttled automation window.** Screenshots don't depend on frame rate. The
  after set is taken with the same views and window size as the before set.

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit (Jest, source scan) | `theme/styleRules.test.ts` › "uses only colour tokens outside the token file", "uses only font-size tokens", "tokens.ts mirrors _tokens.scss" | regex scan of every `src/**/*.{scss,css}` except `_tokens.scss`: no hex, `rgb(a)`, `hsl` or literal `font-size`; each `tokens.ts` key equals its CSS variable's value |
| AC-2 | unit (Jest) | `theme/contrast.test.ts` › "body text meets 4.5:1 on every surface", "muted and badge text meet 3:1", "no VS Code palette value remains" | WCAG relative luminance from the token values (rgba composited over the surface it sits on) |
| AC-3 | unit (JUnit) | `MetamodelServiceTest#enumLabelsAreWords` | Order metamodel: side `BUY → Buy`, `SELL_SHORT → Sell Short`; ordType `MARKET_ON_CLOSE → Market On Close`; timeInForce `GOOD_TILL_CANCEL → Good Till Cancel`; state `CXL → CXL`; securityType `ETF → ETF`; execInst `OK_TO_CROSS → OK To Cross`; field `orderQty` display name `Order Qty` |
| AC-4 | unit (Jest) | `components/EnumCellRenderer.test.tsx` › "shows the label as given with a value class"; `styleRules.test.ts` › "badges are not uppercased or letter-spaced" | "Sell Short" rendered verbatim with class `enum-cell enum-sell-short`; `.enum-cell` has no `text-transform: uppercase` and no letter-spacing above 0.02em |
| AC-5 | component (Jest) | `components/DetailPanel.test.tsx` › "section headers show an icon, not an abbreviation"; `components/DetailModal.test.tsx` › "titles the modal by the singular object" | each `.section-header` holds an `svg[aria-hidden]` and its title; none of the ten abbreviations is rendered; the title reads "Order details" |
| AC-6 | component (Jest) | `App.footer.test.tsx` › "shows the current year"; `styleRules.test.ts` › "the footer sits on the surface colour" | with the clock set to 2031, the footer reads "© 2031 Acme Capital · OMS Admin Tool"; the `.oms-footer` background is `var(--oms-surface)` |
| AC-7 | unit (Jest, source scan) | `styleRules.test.ts` › "every stylesheet is imported", "no rule targets a class nothing renders" | `App.css` is absent; every stylesheet is imported somewhere; every class selector appears in some `.ts`/`.tsx` (`ag-`, `enum-`, `status-` exempt) |
| AC-8 | measured (Chrome, 1920 px) | `screenshots/after` plus a DOM check recorded in verification.md | the sum of `.ag-header-cell` widths equals the grid viewport width ± 2 px, for live orders, live executions and paging orders; the page-size label/select gap is at least 8 px |
| AC-9 | sign-off | `screenshots/before` vs `screenshots/after` (7 views) | the requester's approval of the verify stage, or a note, cited in verification.md |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No OpenAPI or Avro change |
| P-02 | Specification before code, generated models only | n/a | The metamodel endpoint is not generated from a spec; no model changes |
| P-03 | Never edit generated code | comply | Nothing under `build/generated*` is touched |
| P-04 | Contracts evolve compatibly | comply | The metamodel response shape is unchanged; only label strings change; no other reader exists |
| P-05 | Every state change is recorded in the event log | n/a | No state change |
| P-06 | Kafka only through the transactional outbox | n/a | Nothing published |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database change |
| P-08 | Concurrency and idempotency are explicit | n/a | No command or message handling |
| P-09 | Commands and queries stay separate | n/a | Read-only metadata and presentation |
| P-10 | State transitions go through the state machine and task pipeline | n/a | None |
| P-11 | Layering and conventions | comply | Tokens in `theme/`, icons in `components/icons/`, label formatting in the oms-core service that builds the metamodel |
| P-12 | Jackson 3 only | n/a | No JSON mapping change |
| P-13 | Errors and validation follow the framework specs | n/a | No API or validation change |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | AC-1 to AC-7 by tests written first; AC-8 measured in the browser and AC-9 signed off, as the approved proposal states |
| P-15 | Observability | n/a | Presentation only |
| P-16 | Security | comply | No secrets; inline SVG is static markup, nothing user-supplied is rendered as SVG |
| P-17 | Simplicity and dependencies | comply | No new dependency (no icon library, no stylelint, no web font); decisions above |
| P-18 | Modules build standalone | comply | oms-ui and oms-core each pass their own check |
| P-19 | Documentation follows behaviour | comply | Knowledge base below |

## Knowledge Base Updates

- `oms-knowledge-base/ui/oms-admin-ui_spec.md`, a new "Visual design" section:
  - the palette and type scale tokens, and the rule that only `_tokens.scss` holds colour and
    font-size literals (enforced by `styleRules.test.ts`);
  - `tokens.ts` as the AG Grid mirror;
  - the icon component and its names;
  - badge tones by enum;
  - the header and footer;
  - grid column sizing (fit to width; Auto-Size on demand).
- Also: replace the description of the old badges (uppercase) and of the footer, wherever the
  page mentions them.
