# Proposal — SPEC-0058: Give oms-ui a professional visual design

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

oms-ui is the public face of the project, and it still looks like a VS Code clone. SPEC-0054 only
removed emoji. Evidence, from the code and from screenshots of the running app (saved in
`screenshots/before/` of this ticket, 2026-11-10):

- **The tokens are VS Code's palette renamed, and they are bypassed.** `theme/_tokens.scss` holds
  `#1e1e1e`, `#252526`, `#007acc` and the VS Code syntax colours. The stylesheets carry 74 literal
  font sizes and 104 literal colours, and no `font-size` uses a token. The spacing and font-size
  tokens are defined but unused.
- **Status badges are unreadable: "B U Y", "M A R K E T", "C L O S E D".** This is not CSS. oms-core's
  metamodel builds enum labels with `MetamodelService.formatDisplayName`, a camelCase-to-words
  helper meant for field names. On all-caps constants it puts a space before every capital, so
  `/api/v1/metamodel/Order` returns `BUY → "B U Y"` and `SELL_SHORT → "S E L L_ S H O R T"`. The
  badge renderer shows that label in uppercase on top of it.
- **Text stands in for icons.** The detail modal's section headers read "ID", "INST", "ORD",
  "EXEC", "ST", "TIME", "SETL", "DER", "MISC" and "UNASSIGNED". The modal title reads "Orders
  Details".
- **Controls and layout look unfinished.**
  - The paging blotter's page-size selector is an unstyled native select, crammed against its
    label ("Page size[100▾]").
  - Grid columns end halfway across the panel: they are auto-sized when the grid is first ready,
    before it has rows.
- **The footer is a VS Code status bar.** It is accent blue and reads a hard-coded "© 2025".
- **Dead styles remain.** `App.css` (127 lines of CRA boilerplate: `.navbar`, `.nav-menu`) is
  imported nowhere.

Doing nothing leaves the project's showcase looking like an editor theme, with labels a trader
has to decode.

Related knowledge-base page: `oms-knowledge-base/ui/oms-admin-ui_spec.md`.

## What Changes

- **An own palette and type scale, used everywhere through tokens.**
  - `_tokens.scss` gets a palette that is not VS Code's: slate neutrals and a brand accent taken
    from the Acme Capital logo's green. Status colours are tuned for a dark trading UI, and
    contrast is checked.
  - A type scale of at most six sizes, plus tabular figures for numbers.
  - Spacing, radius and elevation tokens.
  - Every stylesheet uses tokens: no literal colour or font size outside the token file. The AG
    Grid theme takes the same tokens through `tokens.ts`.
- **Readable status badges.**
  - oms-core returns human labels for enum values: `BUY → "Buy"`, `SELL_SHORT → "Sell Short"`,
    `PARTIALLY_FILLED → "Partially Filled"`. Field display names are unchanged.
  - Badges show that label in normal case, without wide letter spacing, coloured by meaning:
    side, state, order type.
- **Real iconography.** A small set of inline SVG icons (a React component per icon, no icon
  font) replaces the text abbreviations in the detail modal. Toolbar actions get icons where they
  help: filters, columns, refresh, auto-size, pause/resume, connect/disconnect. Every button keeps
  its text label.
- **Header and footer reworked.**
  - The header gets a clear hierarchy: logo, app name, mode switch, authorisation.
  - The footer is a quiet bar in the surface colour. It shows the current year from the clock and
    the app name; no accent-blue status bar.
- **Finished controls and layout.**
  - The page-size selector and the other native controls (checkboxes, selects, inputs) are styled
    from tokens.
  - Grid columns fill the panel width once rows are present.
  - The modal title reads "Order details" / "Execution details".
- **Dead styles removed.** `App.css` is deleted. Every remaining stylesheet is imported, and no
  rule targets a class that no component renders.
- **Before/after screenshots and the requester's sign-off.** The same views are captured before
  (done) and after, in `screenshots/`, for the requester to judge.

No change is **BREAKING**. The metamodel API's enum `label` values change from spaced capitals to
words. `value` is unchanged. Consumers: oms-ui shows labels; oms-mcp-server does not read the
metamodel labels (to be confirmed in design).

## Scope

### In scope

- oms-ui:
  - tokens, AG Grid theme, every stylesheet, icons;
  - header, footer and modals;
  - badge renderer, page-size selector and native controls;
  - the grid column sizing;
  - dead style removal;
  - the knowledge-base UI page.
- oms-core: enum labels in `MetamodelService`.

### Out of scope

- A light theme or a theme switcher. Dark only, as today; the tokens make a later light theme
  possible.
- New features, new screens, or changes to what the blotters show or do.
- A web font download: system font stack, so the app stays usable offline and adds no dependency.
- An icon library dependency; the few icons are inline SVG.
- Responsive or mobile layouts beyond what works today.
- The developer cockpit, mission control and the knowledge-base explorer (other apps).

## Acceptance Criteria

Automated (Jest in oms-ui, JUnit in oms-core):

- **AC-1** — Given the oms-ui stylesheets, when they are scanned, then no colour literal (hex,
  `rgb()`, `rgba()`, `hsl()`) or font-size literal appears outside `theme/_tokens.scss`. Every
  colour and font size is a `var(--oms-…)` token. `theme/tokens.ts` mirrors `_tokens.scss`
  exactly.
- **AC-2** — Given the token palette, when the text tokens are paired with the surfaces they are
  used on, then:
  - each pair of body text on background or surface has a WCAG contrast ratio of at least 4.5:1;
  - muted text and badge text on their badge backgrounds have at least 3:1;
  - no VS Code palette value (`#1e1e1e`, `#252526`, `#007acc`, `#cccccc`) remains.
- **AC-3** — Given the metamodel endpoint, when enum fields are read, then each label is the
  constant in words: `BUY → "Buy"`, `SELL_SHORT → "Sell Short"`, `PARTIALLY_FILLED → "Partially
  Filled"`, `GTC → "GTC"` (a known acronym stays as is). Field display names are unchanged
  (`orderQty → "Order Qty"`).
- **AC-4** — Given an enum cell, when the grid renders it, then the badge shows the label as
  given, with no letter-splitting or forced uppercase. Its class reflects the value (`enum-buy`)
  for colour.
- **AC-5** — Given the detail modal for an order, when it opens, then its title reads "Order
  details". Each section header shows an SVG icon and its title, and none of the abbreviations
  "ID", "INST", "ORD", "EXEC", "ST", "TIME", "SETL", "DER", "MISC" or "UNASSIGNED" appears as icon
  text.
- **AC-6** — Given the app, when it renders, then the footer shows the current year from the
  clock (not a hard-coded "2025") and uses the surface colour, not the accent.
- **AC-7** — Given the oms-ui sources, when they are scanned, then:
  - `App.css` no longer exists;
  - every `.scss`/`.css` file under `src/` is imported by a component or entry point;
  - no stylesheet class selector is missing from every `.tsx`/`.ts` file (no dead rules; AG Grid
    `ag-*` classes excepted).

Measured in the browser and signed off (production build on 8080, recorded in verification.md):

- **AC-8** — Given the live and paging blotters with rows, when they are shown in a 1920 px wide
  window, then:
  - the grid columns fill the panel width (the sum of column widths equals the viewport width,
    within 2 px);
  - the page-size selector is spaced from its label and styled like the other controls.
- **AC-9** — Given before and after screenshots of the same views in `screenshots/`:
  - live orders;
  - live executions;
  - paging orders;
  - detail modal;
  - filter builder;
  - column selector;
  - authorise modal;

  when the requester reviews them, then the requester signs off the visual design. That is
  recorded in the ticket log as the verify-stage approval, or as a note.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-ui, oms-core (set on the ticket) |
| Contracts (OpenAPI / Avro) | None in oms-contracts. The metamodel endpoint's enum `label` strings change content, not shape |
| Data (tables, migrations) | None |
| Events / Kafka topics | None |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui shows the new labels. oms-mcp-server: design checks whether it reads metamodel labels |
| Knowledge base | `ui/oms-admin-ui_spec.md`: palette, type scale, tokens rule, icons, badges, header and footer |

## Open Questions

- [resolved] **Palette direction — please review at approval.** → assumption: an own dark theme of
  slate neutrals with the Acme Capital logo's green as the brand accent (the logo already uses
  `#22c55e`). Blue is kept only as an information colour. Say so before approving if the brand
  should lead with another colour.
- [resolved] **Icons — please review at approval.** → assumption: inline SVG components drawn for
  this app, about 15 icons, stroke style, no dependency. Rejected: an icon library such as
  `lucide-react`, a dependency for a handful of glyphs. Reversible.
- [resolved] Font → assumption: the system UI font stack, with tabular figures for numeric cells;
  no web font download.
- [resolved] How is sign-off recorded? → assumption: the requester reviews the screenshots and
  approves the verify stage (or leaves a note); AC-9 cites that log line.
- [resolved] Badge case → assumption: labels in words ("Buy", "Partially Filled"), not uppercase;
  short acronyms the domain uses (`GTC`, `IOC`, `FOK`, `DAY`) stay uppercase.
