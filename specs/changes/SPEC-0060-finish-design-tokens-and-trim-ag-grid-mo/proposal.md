# Proposal — SPEC-0060: Finish design tokens and trim AG Grid modules

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

SPEC-0058 introduced the design tokens and the style-rule tests. Its verification left five
follow-ups, which are confirmed in the code today:

1. **Grid font sizes are literals.** `theme/agGridTheme.ts` sets `fontSize: 13` and
   `headerFontSize: 12`, the same values as the `--oms-font-size-sm` (0.8125rem) and
   `--oms-font-size-xs` (0.75rem) tokens, but written by hand. A type-scale change would not reach
   the grid.
2. **The logo carries its own colours.** `components/AcmeLogo.tsx` defaults `color` to `'#0f172a'`
   and draws the chart line with `stroke="#22c55e"`, which is exactly `--oms-accent`. The app passes
   `currentColor` for the text, so the default is dead weight and the green is a second copy of the
   brand colour.
3. **The token rule stops at stylesheets.** `theme/styleRules.test.ts` scans `.scss`/`.css` only.
   A colour literal in a TSX inline `style` or an SVG `fill`/`stroke`/`stopColor` is not caught. That
   is how the two logo literals survived.
4. **The grid registers every Community module.** `theme/agGridModules.ts` registers
   `AllCommunityModule` (about 114 kB gzipped) because a missing module only shows at run time as
   AG Grid error #200: a live grid that showed no rows, in SPEC-0057.
   - A throw-away spike for this proposal confirmed that a real AG Grid in jsdom logs
     `AG Grid: error #200 … is not registered` to `console.error` when a used feature's module is
     missing. A test can therefore catch it.
   - Boolean columns ask for `agSetColumnFilter`, which is an AG Grid **Enterprise** filter and
     cannot work with Community modules at all.
5. **The detail modal's formatting.** Since SPEC-0059 the detail panel uses the grid's number
   formatters (`services/fieldFormat.ts`), and dates go through `DateTimeService`. What is missing is
   a test that keeps the detail panel and the grid cells formatting the same value the same way.

If nothing is done, the token rule has known holes, every user downloads grid features nobody
uses, and the next divergence between detail panel and grid goes unnoticed.

## What Changes

- **Grid theme.** The AG Grid theme takes its font sizes from the type-scale tokens. The tokens are
  mirrored in `theme/tokens.ts` and checked against `_tokens.scss` by the existing mirror test.
- **Logo.**
  - The default colour is `currentColor`.
  - The chart line uses the accent token.
  - No colour literal remains in the component.
- **Token rule.** The style-rule test also scans the TSX/TS sources:
  - colour literals (hex, colour functions, named colours) in inline `style` objects;
  - colour literals in SVG colour attributes (`fill`, `stroke`, `stopColor`, `color`,
    `floodColor`, `lightingColor`);
  - literal font sizes in inline `style`.

  `theme/tokens.ts` (the mirror) is exempt, and so are the values `none`, `currentColor` and
  `transparent`, and `url(#…)` references.
- **AG Grid modules.**
  - `AllCommunityModule` is replaced by the exact Community modules both grids use: client-side row
    model with its transaction API, column state and auto-size, cell-change flashing, and the text,
    number and date filters.
  - A test runs a real AG Grid with the configuration of both blotters (their column definitions
    and grid options) on exactly the registered modules, and fails on any `error #200`.
  - Boolean columns use a filter that exists in Community.
- **Detail panel vs grid.** A test asserts that the detail panel and the grid's value formatter
  produce the same text for a price, a quantity and a timestamp.

No **BREAKING** change: no API, contract or data change.

## Scope

### In scope

- `theme/agGridTheme.ts`, `theme/tokens.ts`, `components/AcmeLogo.tsx`, `theme/styleRules.test.ts`.
- `theme/agGridModules.ts`, a module-check test, and the boolean filter type in
  `ColumnConfigService`.
- The detail panel vs grid consistency test.
- An update of the design-system page in the knowledge base.

### Out of scope

- New tokens or a redesign. The grid's spacing, radius and row height stay as they are.
- AG Grid Enterprise, and new grid features.
- Code splitting or other bundle work beyond the grid modules.
- SVG geometry attributes such as the logo's `fontSize="42"`, which is in viewBox units, not a CSS
  font size.

## Acceptance Criteria

Tests run with the oms-ui frontend suite.

- **AC-1** — Given `theme/agGridTheme.ts`, when the theme parameters are read, then `fontSize` and
  `headerFontSize` come from `omsTokens` (the mirror of `--oms-font-size-sm` and
  `--oms-font-size-xs`), with no number literal. Given the mirror test, when a font-size token in
  `tokens.ts` differs from `_tokens.scss`, then it fails.
- **AC-2** — Given `components/AcmeLogo.tsx`, when it is scanned, then it contains no colour
  literal. When the logo renders without a `color` prop, then text and outline use `currentColor`
  and the chart line uses the accent token.
- **AC-3** — Given the TSX/TS sources outside `theme/tokens.ts` and tests:
  - when they are scanned, then no inline `style` object holds a colour literal or a literal
    `fontSize`;
  - no SVG colour attribute holds a colour literal (`none`, `currentColor`, `transparent` and
    `url(#…)` are allowed).

  A fixture test proves that each kind of literal is detected.
- **AC-4** — Given `theme/agGridModules.ts`, when it is loaded, then it registers named modules
  and not `AllCommunityModule`.
- **AC-5** — Given a real AG Grid in jsdom with only the modules `agGridModules.ts` registers, when
  the History and the Live blotter configurations are applied and their used features exercised,
  then no `AG Grid: error #200` is logged:
  - the column definitions from `ColumnConfigService` for orders and executions, including number,
    date, enum, boolean and id columns;
  - `applyTransaction`, `getColumnState`, `getFilterModel` / `setFilterModel` on a text, a number
    and a date column, `autoSizeAllColumns`, `sizeColumnsToFit`, and cell-change flashing.

  Given one of those modules is removed, when the same test runs, then it fails (the check is shown
  to bite).
- **AC-6** — Given a boolean field, when its column definition is built, then its filter is a
  Community filter.
- **AC-7** — Given the built application (`npm run build`), when the gzipped size of the main
  JavaScript bundle is measured, then it is smaller than the same measurement taken before the
  change. Both numbers are recorded in verification.md.
- **AC-8** — Given an execution with a price, a quantity and a transact time, when the detail
  panel renders it, then the shown texts equal what the grid's `valueFormatter` for those columns
  returns for the same values.
- **AC-9** — Given the whole change, when the oms-ui verify commands run (`npm test` and the
  Gradle `check`), then they pass, including all existing blotter, streaming and style tests.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-ui |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui users: a smaller download; boolean column filters change from the (non-working) set filter to a Community filter |
| Knowledge base | `ui/design-system.md` (tokens reach the grid and the logo, the TSX rule, the module list and its check); `log.md` |

## Open Questions

- [resolved] Should the logo green be a brand exception rather than a token? → assumption: use
  the token. `--oms-accent` *is* the brand green (`#22c55e`, documented in `_tokens.scss` as "the
  Acme Capital logo's green"), so no exception is needed.
- [resolved] Which filter for boolean columns? → assumption: the text filter, the simplest Community
  filter that matches "Yes"/"No". It is reversible, and today's set filter cannot work in Community.
- [resolved] Should the module check run as a unit test or at build time? → assumption: a Jest test
  in the normal suite, so `spec verify` and CI catch it without a new build step.
- [resolved] Bundle target: a fixed number, or smaller than before? → assumption: smaller than the
  measured baseline, with both numbers recorded. The exact saving depends on what the used modules
  pull in, and a fixed target would be a guess.
- [resolved] Item (5) of the goal is largely done by SPEC-0059. → assumption: deliver it as the
  consistency test (AC-8), and fix any divergence that test finds.
