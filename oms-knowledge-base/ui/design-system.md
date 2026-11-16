---
type: Specification
title: "Design System"
description: "The visual language of the OMS UI: design tokens in theme/_tokens.scss (surfaces, text, brand accent, status tones, borders, spacing, shape, type), their TypeScript mirror for AG Grid, and the tests that enforce token use and contrast."
tags: [ui, design-system, tokens, accessibility, ag-grid]
status: draft
updated: "2026-11-16T12:00:00Z"
sources:
  - resource: "repo:oms-ui/frontend/src/theme/_tokens.scss"
  - resource: "repo:oms-ui/frontend/src/theme/tokens.ts"
  - resource: "repo:oms-ui/frontend/src/theme/agGridTheme.ts"
  - resource: "repo:oms-ui/frontend/src/theme/styleRules.test.ts"
  - resource: "repo:oms-ui/frontend/src/theme/contrast.test.ts"
  - resource: "repo:oms-ui/frontend/src/theme/gridModules.ts"
  - resource: "repo:oms-ui/frontend/src/theme/gridModules.test.tsx"
  - resource: "repo:oms-ui/frontend/src/components/AcmeLogo.tsx"
---
# Design System

The OMS UI is a dark, dense trading interface: slate neutrals, the Acme Capital green as the one
brand accent, and colour reserved for meaning (status, side, warnings). It was introduced in
SPEC-0058; SPEC-0060 finished the remaining tokens (grid font sizes, the logo) and trimmed the AG Grid modules. Screens
and behaviour are specified in [Admin UI](admin-ui.md) and [Order State Indicator](order-state-indicator.md).

## Tokens

`oms-ui/frontend/src/theme/_tokens.scss` is **the only place colours and font sizes are written as
values**. Everything else uses its CSS custom properties (`--oms-*`).

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `--oms-bg`, `--oms-surface`, `--oms-surface-raised`, `--oms-surface-overlay`, `--oms-odd-row`, `--oms-scrim` | From the page up: background, panels, raised panels, overlays, grid striping, modal scrim |
| Text | `--oms-text`, `--oms-text-muted`, `--oms-text-strong`, `--oms-text-on-accent` | Body, secondary, emphasis, text on the accent |
| Brand accent | `--oms-accent`, `-hover`, `-active`, `-bg`, `-bg-strong` | Primary actions, selection, focus |
| Tones | `--oms-success`, `--oms-warning`, `--oms-danger`, `--oms-info`, `--oms-neutral`, `--oms-violet`, `--oms-orange`, `--oms-teal`, each with a `-bg` tint | Status badges and indicators; blue is information only |
| Borders and interaction | `--oms-border`, `-light`, `-strong`, `-hover`, `--oms-input-bg`, `--oms-input-border`, `--oms-hover`, `--oms-selection`, `--oms-focus-ring` | Separators, inputs, hover, selected rows, keyboard focus |
| Code | `--oms-syntax-*` | The JSON viewer |
| Elevation | `--oms-shadow-md`, `--oms-shadow-lg` | Menus, dialogs |
| Spacing | `--oms-space-1` … `--oms-space-6` (0.25 to 2 rem) | Padding and gaps |
| Shape and type | `--oms-radius-sm/md/lg` (3, 6, 10 px), `--oms-font-family`, `--oms-font-mono`, `--oms-font-size-2xs` … `-xl` (0.6875 to 1.25 rem) | Corners, the type scale |

## AG Grid

The grids use AG Grid's Theming API: `agGridTheme.ts` builds `omsGridTheme` (Quartz, dark) from
`tokens.ts`, a TypeScript mirror of the tokens AG Grid needs. This covers colours and the type
scale: cells use `--oms-font-size-sm` and headers use `--oms-font-size-xs`. A token change
therefore reaches the grid without editing the theme.

The Acme Capital logo (`AcmeLogo.tsx`) also takes its colours from tokens:
- text and outline use `currentColor`;
- the chart line uses `--oms-accent`, the brand green.

### Modules

The grids register only the AG Grid Community modules they use, listed in `theme/gridModules.ts`
and registered by `theme/agGridModules.ts`.
- **Size.** The list replaces `AllCommunityModule`: the main bundle went from 429.5 to 360.4 kB
  gzipped.
- **Development builds** also register `ValidationModule`. A feature whose module is missing then
  shows in the console as AG Grid error #200, instead of failing silently.
- **Boolean columns** use the Community text filter, on the "Yes"/"No" the cell shows.

`theme/gridModules.test.tsx` checks the list:
- it runs real grids with both blotters' column definitions and options, on exactly that list;
- it exercises filters, sort, transactions, cell flashing and column sizing;
- it fails on error #200, or when a filter or sort does nothing;
- it also leaves out each module in turn and expects the failure, so every listed module is needed.

When you use a new grid feature in a blotter, add it to that test. The test then names the module
to add.

## Rules the tests enforce

`theme/styleRules.test.ts`:
- only colour tokens and font-size tokens are used outside the token file;
- the same holds in the TS/TSX sources (SPEC-0060), with `tokens.ts` as the only exception:
  - no hex colour or colour function (`rgb()`, `hsl()`, …) in any string, whether inline `style`,
    an SVG attribute or anything set from JS;
  - no literal colour, named colours included, in a colour-valued style property (`color`,
    `background`, `border…`, `fill`, `boxShadow`, …) or an SVG colour attribute (`fill`, `stroke`,
    `stopColor`, …). This covers values in quotes, in `{…}` expressions and in conditionals;
    `none`, `currentColor`, `transparent`, `inherit`, `url(#…)` and `var(--oms-…)` are allowed;
  - no literal `fontSize:`.

  SVG geometry such as the logo's `fontSize="42"` (viewBox units) is not a CSS font size;
- `tokens.ts` mirrors `_tokens.scss` exactly;
- badges are not uppercased or letter-spaced;
- every stylesheet is imported, and no rule targets a class nothing renders.

`theme/contrast.test.ts` (WCAG):
- body text meets 4.5:1 on every surface, and the text on the accent button meets 4.5:1;
- muted and badge text meet 3:1;
- no leftover VS Code palette value remains.

## Other apps

The [KB Explorer](../tools/kb-explorer.md) uses the same tokens (SPEC-0066).
- **Its copy.** It keeps a copy in `oms-kb-explorer/src/theme/tokens.css`, so it builds without
  oms-ui. Its `tokens.test.ts` fails when the copy differs from `_tokens.scss`.
- **Its tests.** It has its own style-rule and contrast tests, and Tailwind there is limited to the
  token colours and sizes.

## Adding to it

Add the value to `_tokens.scss` (and to `tokens.ts` if AG Grid needs it), use the custom property,
and let the two tests prove the rest. A new colour needs a reason: prefer an existing tone.

Then copy the `:root` block to `oms-kb-explorer/src/theme/tokens.css`. Its build fails until you
do.
