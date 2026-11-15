# Proposal — SPEC-0059: Improve trader ergonomics in oms-ui blotters

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Traders and operations staff spend their day in the order and execution blotters. SPEC-0054 and
SPEC-0058 improved the look but barely touched ergonomics. The problems listed in the goal are
confirmed in the code:

- **Numbers.** `ColumnConfigService` formats every number column with plain `toLocaleString()`
  and leaves it left-aligned. Prices therefore show as many decimals as they happen to have (86.96
  next to 170), and quantities don't line up for comparison.
- **Exec Type.** `execType` is a string field (the FIX code), not an enum. The metamodel gives it
  no labels, so the cell shows `F` instead of "Trade".
- **ID columns.** String columns default to 150 px. An execution id is its order id plus `-F1`
  (exchange simulator), so with the end cut off, Exec Id and Order Id look identical.
- **Sort order.** The History (REST) execution blotter calls `/api/executions`, whose default
  sort is `id` ascending (`@PageableDefault(sort = "id")`). It shows the oldest fills first, while
  the orders search defaults to newest first.
- **Keyboard.** Nothing in the UI handles the keyboard. Escape does not close the detail modal
  (its title already reads "Order details" since SPEC-0058), nor the filter builder or column
  selector. There are no shortcuts.
- **Labels and toolbars.** The data-mode toggle says "REST" / "Streaming", which are technical
  names. The toolbar is copied between `Blotter.tsx` and `StreamingBlotter.tsx`, so every change is
  made twice and the two drift apart.

If nothing is done, users keep reading raw codes and misaligned numbers, mistake one id for
another, and reach for the mouse for everything.

## What Changes

All changes are in oms-ui, in the shared column builder, the blotters, the dialogs and the app
header:

- **Numbers** are right-aligned in cells and headers.
  - Prices (`price`, `stopPx`, `lastPx`, `avgPx` and other `*Px` fields) show at least 2 and at most
    8 decimals, with thousands separators.
  - Quantities and other numbers show thousands separators and only the decimals they have.
- **Exec Type** (and the detail panel) show a label for each FIX ExecType code, e.g. `F` → "Trade",
  `4` → "Canceled". An unknown code is shown as it is.
- **ID columns** (`orderId`, `execId`, `clOrdId`, `rootOrderId`, `parentOrderId`, …) are wider by
  default. When a value doesn't fit, the beginning is truncated so the distinguishing end stays
  visible (`…-F1`), and a tooltip shows the full value.
- **Default sort:** the History execution blotter asks for newest first (`id,DESC`) when the user
  has chosen no sort, matching the orders blotter.
- **Keyboard:**
  - Escape closes the detail modal, the filter builder and the column selector.
  - Enter opens the details of the focused row.
  - `F` opens Filters, `C` Columns, `R` refreshes (History), `P` pauses or resumes (Live).
  - Shortcuts are ignored while typing in an input. Each button's tooltip names its shortcut.
- **Mode labels:** the toggle reads **Live** and **History**. Live stays the default.
- **One toolbar:** a shared `BlotterToolbar` component renders title, record count, Filters,
  Columns and Auto-Size for both blotters, plus mode-specific actions (Live: status, Pause, Connect,
  snapshot; History: Refresh, Auto-refresh).

No **BREAKING** change: no API, contract or data change.

## Scope

### In scope

- `ColumnConfigService` formatting and alignment, the FIX ExecType labels, ID column widths and
  truncation, applied to both blotters and the detail panel.
- The default sort of the History execution blotter.
- Keyboard handling in the blotters and their dialogs.
- Mode labels, and one shared toolbar component.
- Tests for all of the above, and an update of the UI specification in the knowledge base.

### Out of scope

- Backend changes: no metamodel labels for `execType` in oms-core, no change to `/api/executions`
  (which also ignores filters today, a separate gap), and no contract changes.
- Design tokens and AG Grid module trimming (SPEC-0060).
- Instrument-specific tick sizes or per-symbol price precision. Prices use one 2-to-8 decimal rule.
- New columns, saved layouts, or user-configurable shortcuts.

## Acceptance Criteria

Tests run with the oms-ui frontend suite (`npm test -- --watchAll=false`). Number formatting is
asserted with the `en-US` locale.

- **AC-1** — Given the metamodel of orders or executions, when `ColumnConfigService` builds the
  column definitions, then every column of type `number` is right-aligned (cell and header), and
  every other column is not.
- **AC-2** — Given price columns (`price`, `stopPx`, `lastPx`, `avgPx`), when values 170, 86.96,
  1234.5, 0.12345678 and null are formatted, then they show as "170.00", "86.96", "1,234.50",
  "0.12345678" and "". Given quantity columns (`orderQty`, `cumQty`, `leavesQty`, `lastQty`), when
  1000, 10.5 and 0 are formatted, then they show as "1,000", "10.5" and "0".
- **AC-3** — Given an execution with `execType` `F`, when it is shown in the execution blotter and
  in the detail panel, then it reads "Trade". Codes `0`, `4`, `5`, `8`, `C`, `G`, `H` read "New",
  "Canceled", "Replaced", "Rejected", "Expired", "Trade Correct" and "Trade Cancel". An unknown code
  `Z` reads "Z".
- **AC-4** — Given an order id column and an exec id column, when the column definitions are built,
  then both are at least 220 px wide by default. When a cell is narrower than its value, the cell
  keeps the end of the value visible (start-truncated). Hovering shows the full value.
- **AC-5** — Given the History execution blotter with no sort chosen, when it loads, then
  `/api/executions` is requested with `sort=id,DESC`. When the user sorts a column, that sort is
  sent instead. The History orders blotter's request is unchanged.
- **AC-6** — Given the detail modal, the filter builder or the column selector is open, when the
  user presses Escape, then it closes. When the user presses another key, it stays open.
- **AC-7** — Given a blotter with focus outside any input:
  - `F` opens the filter builder and `C` opens the column selector;
  - `R` reloads the History blotter, and `P` toggles Pause/Resume in the Live blotter;
  - Enter on a focused row opens its detail modal.

  Given focus in a text input, when the same keys are typed, then no shortcut fires.
- **AC-8** — Given the app header, when it renders, then the mode toggle shows the buttons "Live"
  and "History", with Live selected by default, and no button labelled "REST" or "Streaming".
- **AC-9** — Given the Live and History blotters, when they render, then both render the toolbar
  through one shared `BlotterToolbar` component. Live-only actions (Pause, Connect or Disconnect,
  snapshot) appear only in Live, and History-only actions (Refresh, Auto-refresh) only in History.
- **AC-10** — Given the whole change, when the oms-ui verify commands run
  (`npm test -- --watchAll=false --passWithNoTests` and the Gradle `check`), then they pass, and
  the existing blotter, streaming and detail tests still pass.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-ui |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui users only: formatting, labels, keyboard, mode names |
| Knowledge base | `ui/admin-ui.md` (formatting rules, ExecType labels, shortcuts, Live/History, the shared toolbar); `capabilities/admin-ui.md` if a requirement needs adding; `log.md` |

## Open Questions

- [resolved] Where do the ExecType labels come from: the backend metamodel or the UI? →
  assumption: a display-only map in the UI. `execType` is a FIX code string, not an enum. Changing
  the metamodel would widen the ticket to oms-core for no behavioural gain, and the map is easy to
  move later.
- [resolved] How many decimals for prices? → assumption: at least 2 and at most 8, with no
  per-instrument tick sizes. 8 matches the decimal scale unified in SPEC-0039; tick sizes need
  instrument data the OMS doesn't have.
- [resolved] Which shortcut keys? → assumption: single letters F, C, R, P, plus Enter and Escape,
  ignored inside inputs, and shown in each button's tooltip. This is reversible and needs no user
  settings.
- [resolved] Should "Live / History" also rename internal types (`'rest' | 'streaming'`) and saved
  state keys? → assumption: no. Only user-visible labels change, so saved blotter state keeps
  working.
- [deferred] Filters on the History execution blotter are ignored by `/api/executions`. → Safe to
  defer: unchanged behaviour, outside the goal's list. Record it as a follow-up.
