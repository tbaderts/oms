# Design — SPEC-0015: Add donut chart and KPI tiles to dashboard

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The Dashboard is `developer-cockpit/src/renderer/views/dashboard/`.

- **`DashboardView.tsx`**: the title, a load-error alert, `<SpecOverview/>` and `<TicketTable/>`.
- **`SpecOverview.tsx`**: loads the tickets (`useSpecTicketsStore.load`) and keeps them live
  (`useSpecTicketsLiveRefresh`). It renders two cards:
  - *Spec workflow*, with `<StageDistribution/>` (a 12 px, 100% stacked bar) and a *Task
    completion* number with a bar;
  - *Needs me*, with awaiting, blocked and mine-in-progress lists.
- **`StageDistribution.tsx`**: segments and legend from `stageDistribution(tickets)` in
  `src/renderer/lib/spec-tickets.ts`. That function counts non-archived tickets per stage in
  `DISTRIBUTION_ORDER` (the `SPEC_STAGES`, then `blocked`) and gives an unrounded `pct`.
  `summarize()` in the same file gives awaiting, blocked, tasks and mine-in-progress.
- **`TicketTable.tsx`**: filters through the store (`mineOnly`, `stage`, `module`, `text` and
  `setFilter`, then `filterTickets()`), and has a *Stage filter* select. Its stage column is
  plain text.
- **Colours**: the `--stage-*` tokens in `src/renderer/styles/globals.css` (`:root` and `.dark`)
  are an ordinal blue ramp from SPEC-0006, plus `#898781` for done and `#d03b3b` for blocked. Only
  `StageDistribution` uses them. Card surfaces: light `#ffffff`, dark `--color-card` `#1e293b`.
- **Tests**: `test/renderer/Dashboard.test.tsx` (portfolio, needs me, opening tickets, load
  error, live refresh through a fake WebSocket) and `test/renderer/StageDistribution.test.tsx`.
  Fixtures are in `test/renderer/ticket-fixtures.ts` (`summary()` and `mockCockpit()`).
- **Closest example to follow**: `StageDistribution` (data from `lib/spec-tickets`, colours from
  the tokens, a legend that doubles as the table view, an `aria-label` text alternative) and
  SPEC-0006's `SpecOverview` layout.
- **Read**:
  - the proposal;
  - `developer-cockpit/spec/03-features.md` §1 Dashboard;
  - the dataviz skill: form choice, colour formula, marks and anatomy, interaction, and the
    palette validator.

## Approach

### Layout

```
Dashboard
├─ title + load-error alert                                   (unchanged)
├─ KPI tiles (6, one row; 3 per row below lg, 2 below sm)
│   Active tickets · In progress · Awaiting approval · Blocked · Done · Task completion (ring)
├─ grid lg: [ Ticket progress card (donut + legend + filter chip) | Needs me card (unchanged) ]
└─ TicketTable (stage column gets a colour dot; filtered by the shared store)
```

### Files

| File | Change |
|---|---|
| `src/renderer/lib/spec-tickets.ts` | Adds `kpis(tickets)`, a pure function returning `{ active, inProgress, awaiting, blocked, done, tasksDone, tasksTotal, completionPct }` over non-archived tickets. `inProgress` counts non-archived tickets whose status is not done. `stageDistribution()` and `DISTRIBUTION_ORDER` are reused unchanged |
| `src/renderer/views/dashboard/KpiTiles.tsx` | New. Six tiles, each a card with an icon, a label in text tokens, a large value in text tokens, and a coloured top band of 3 px plus an icon tint as the identity accent. *Blocked* and *Done* are `<button>`s that toggle the stage filter (`aria-pressed`). *Task completion* shows `NN%` (or `–`) with a 28 px SVG progress ring and "x of y tasks" |
| `src/renderer/views/dashboard/StageDonut.tsx` | New, replacing `StageDistribution.tsx`. Details below |
| `src/renderer/views/dashboard/SpecOverview.tsx` | Renders `<KpiTiles/>` above a two-column grid: the *Ticket progress* card (`<StageDonut/>`) and the existing *Needs me* card. The task-completion block moves into the tile |
| `src/renderer/views/dashboard/TicketTable.tsx` | The stage cell gets an 8 px dot in `var(--stage-<status>)` before the stage name; the name stays text. Nothing else changes |
| `src/renderer/views/dashboard/StageDistribution.tsx` | Deleted; its test is replaced by `StageDonut.test.tsx` |
| `src/renderer/styles/globals.css` | New `--stage-*` values (below) and an updated comment |
| `developer-cockpit/spec/03-features.md` | §1 Dashboard describes the overview row, the donut and the filtering |

### `StageDonut`

- **Data**: `stageDistribution(tickets)`, which gives the non-archived tickets in pipeline order
  with empty stages left out.
- **Geometry**: an SVG with `viewBox` 0 0 200 200; outer radius 92, inner radius 62. Each segment
  is a `<path>` annulus sector from cumulative angles starting at 12 o'clock and going clockwise.
  The angle is `pct/100 × 360°`.
  - Following the dataviz mark spec, a 2 px gap separates neighbouring segments: each path is
    stroked with `var(--color-card)` at width 2.
  - A single non-empty stage is drawn as two half arcs, because an SVG arc cannot span exactly
    360°.
- **Centre**: the total in large tabular figures and the label "active tickets", both in text
  tokens.
- **Identity**: the fill is `var(--stage-<stage>)`. The legend is a list of `<button>`s, each with
  a swatch, the stage name, the count and the rounded percentage. Blocked also gets the
  `AlertTriangle` icon, because a status colour is never shown without an icon and a label.
- **Text alternative**: the `<svg>` has `role="group"` (not `img`: an image's children are presentational, which would hide the segment buttons from assistive technology; changed in verify) and an `aria-label` listing every stage with
  its count and percentage, as `StageDistribution` does today. The legend doubles as the table
  view.
- **Interaction**:
  - Each segment `<path>` has `role="button"`, `tabIndex={0}`, an `aria-label` such as
    "implement: 1 of 5 (20%)" and `aria-pressed` while its stage is the active filter.
  - Hover and focus set `hovered`. The hovered segment is drawn 6 px further out radially, and a
    tooltip shows the stage, the count and the percentage in the donut's hole, in place of the
    total. *Changed during implementation (T-5):* the first version put the tooltip card outside
    the ring, and the screenshot showed it covering the legend.
  - Click, Enter or Space toggles the filter.
  - The legend buttons do the same.
- **Filter toggle**: `toggleStage(stage)` is a small helper in `StageDonut.tsx`, also used by
  `KpiTiles`.
  - If `store.stage === stage`, it calls `setFilter({ stage: '' })`.
  - Otherwise it calls `setFilter({ stage, mineOnly: false })`. The donut counts everyone's
    tickets, so the filtered table must show everyone's too.
- **Filter chip**: when `store.stage` is set, a chip under the donut shows "Showing: <stage>"
  with a *Clear* button that calls `setFilter({ stage: '' })`. The table's own *Stage filter*
  select shows the same value because both read the store.
- **Empty state**: with no active tickets, the card shows "No active tickets yet." and no SVG.
  `KpiTiles` shows 0 counts and `–` for completion.

### Colours (validated, see Decisions)

| token | light (card `#ffffff`) | dark (card `#1e293b`) |
|---|---|---|
| `--stage-proposal` | `#eda100` yellow | `#c98500` |
| `--stage-design` | `#1baf7a` aqua | `#199e70` |
| `--stage-plan` | `#eb6834` orange | `#d95926` |
| `--stage-implement` | `#2a78d6` blue | `#3987e5` |
| `--stage-verify` | `#e87ba4` magenta | `#d55181` |
| `--stage-done` | `#6250d6` violet | `#9085e9` |
| `--stage-blocked` | `#d03b3b` status critical | `#d03b3b` |

KPI tile accents reuse these tokens (by hue, as listed in the proposal):

| Tile | Accent |
|---|---|
| Active | blue (`--stage-implement`) |
| In progress | yellow (`--stage-proposal`) |
| Awaiting approval | orange (`--stage-plan`) |
| Blocked | blocked red, with the `AlertTriangle` icon |
| Done | violet (`--stage-done`) |
| Task completion | aqua (`--stage-design`) |

Values and labels always use text tokens. A colour marks identity; it is never used as text.

## Contract Changes

None — this is a renderer-only change; no OpenAPI, Avro or IPC change.

## Data & Persistence

None — the counts come from the ticket summaries the cockpit already loads.

## Events & Messaging

None — the existing `specs:tickets-changed` live refresh keeps the overview current; nothing new.

## Domain, State & Orchestration

None — no OMS state. Stage filtering reuses the spec-tickets store's existing `stage` and
`mineOnly` filter state.

## Alternatives & Decisions

- **The palette is the validated categorical order, not hue-gap rules.**
  - The stages use the dataviz reference categorical hues blue, orange, aqua, yellow and magenta,
    plus violet (slot 7) instead of green (slot 6): green next to the blocked status red collapses
    under deutan simulation (ΔE 5.9).
  - *Blocked* keeps the reserved status-critical red and always carries an icon and a label.
  - **Changed during implementation (T-1):** the slots were first assigned in pipeline order
    (proposal blue, design orange, plan aqua, implement yellow, verify magenta). The validator
    passed it, but it treats tritan as advisory. AC-2 requires tritan ΔE ≥ 8, and
    `stageColors.test.ts` failed on light implement yellow ↔ verify magenta (tritan ΔE 5.8). An
    exhaustive search over the 720 assignments of the six hues, with blocked red fixed last,
    found four that pass every pair in both themes. The chosen one keeps done violet: proposal
    yellow, design aqua, plan orange, implement blue, verify magenta, done violet.
- **Validator results** (`validate_palette.js`, adjacent pairs in donut order, plus the wrap pair
  blocked → proposal measured on its own; `stageColors.test.ts` checks all pairs and all three
  CVD types):

  | Check | Light (`#ffffff`) | Dark (`#1e293b`) |
  |---|---|---|
  | Lightness band | PASS | PASS |
  | Chroma floor | PASS | PASS |
  | CVD separation (worst pair) | PASS, ΔE 9.1 (protan, aqua ↔ yellow) | PASS, ΔE 8.4 (protan, aqua ↔ yellow) |
  | Normal-vision floor (worst pair) | PASS, ΔE 22.9 | PASS, ΔE 19.7 |
  | Contrast vs surface | WARN: yellow 2.17, aqua 2.82 and magenta 2.69 are below 3:1 | PASS |
  | Wrap pair blocked → proposal (worst CVD / normal) | ΔE 19.8 (deutan) / 24.1 | ΔE 10.2 (deutan) / 16.9 |

  The light-theme contrast WARN is relieved by the legend: every colour appears with its stage
  name and count. That is the "visible label" part of AC-2.
- **Rejected palettes:**
  - The first AC-2 proxy (hue gap of at least 25° plus 3:1 contrast) fails the CVD and
    normal-vision floors. That is why the proposal was reopened.
  - The old ordinal blue ramp does not meet the goal ("more colours").
- **Donut, not pie.** It is the same part-to-whole encoding with the total in the hole. Seven
  categories is the most this form handles, which is why the proposal limits the overview to
  stages. Rejected: a full pie (no room for the total) and keeping the stacked bar (the goal asks
  for a pie chart).
- **Plain SVG, no chart library.** One donut does not justify a dependency (P-17). Rejected:
  Recharts and Chart.js.
- **The test computes colour metrics itself.** `stageColors.test.ts` implements OKLab and the
  Machado 2009 colour-vision simulation (full severity) in about 60 lines, so the CI check does not
  depend on the skill's script, which lives outside the repository. Its numbers may differ
  slightly from the validator's; the thresholds are the AC's (8 and 15).
- **Filtering clears "mine only".** The donut counts all active tickets. Filtering the table to a
  stage while "mine only" stays on would show fewer rows than the segment's count.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| A colour in the light theme is below 3:1 against the card | Always shown with its legend label and count (AC-2); the legend is a list a screen reader can read |
| Arc geometry is wrong for a single stage or very small shares | A single stage is drawn as two half arcs (unit-tested). Very small shares are drawn at their exact angle; the first idea, a 1° minimum, was dropped in verify because it overlapped the next segment. Below about 1° (360+ active tickets) a segment is hard to hover, but its legend entry still filters, and its count and percentage stay exact there |
| The donut and the table disagree after a filter change | Both read the same store fields; a test asserts the table rows after a click |
| Dashboard tests depend on the stacked bar | Replaced by donut tests; the Dashboard test is updated in the same task |

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | component | `test/renderer/StageDonut.test.tsx#segments in pipeline order, proportional arcs, centre total, archived excluded, text alternative` | Segment order and `data-stage`; arc angles in proportion to counts (from `data-start` and `data-end`); centre total; `aria-label` with every stage, count and percentage |
| AC-2 | unit + component | `test/renderer/stageColors.test.ts#distinct stage colours, CVD and normal-vision separation, chroma floor (light and dark)`; `StageDonut.test.tsx#every segment has a visible legend label with name and count` | Tokens parsed from `globals.css`; ΔE ≥ 8 for protan, deutan and tritan and ≥ 15 for normal vision on every neighbouring pair and the wrap pair; chroma ≥ 0.1; all 7 colours distinct; legend entries present |
| AC-3 | component | `test/renderer/Dashboard.test.tsx#KPI tiles show active, in progress, awaiting, blocked, done and task completion` | Tile values for the fixture tickets (5, 4, 2, 1, 1, 30%) and a distinct accent per tile |
| AC-4 | component | `Dashboard.test.tsx#clicking a donut segment, legend entry or tile filters the ticket table and Clear resets it` | Table rows after each click; the chip appears; toggling off; *Blocked* and *Done* tiles |
| AC-5 | component | `StageDonut.test.tsx#hover and focus show stage, count and percentage; Enter and Space filter` | Tooltip text; key handling |
| AC-6 | component | `Dashboard.test.tsx#empty portfolio shows no-active-tickets and zero tiles` | Text "No active tickets yet"; tiles 0; completion "–" |
| AC-7 | component | `Dashboard.test.tsx#live refresh updates donut, legend and tiles` (extends the existing live-refresh test), `#shows load errors instead of an empty portfolio` (existing) | New counts after the event; error alert |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contracts touched |
| P-02 | Specification before code, generated models only | comply | Proposal and design come before the code; `03-features.md` is updated |
| P-03 | Never edit generated code | n/a | No generated code involved |
| P-04 | Contracts evolve compatibly | n/a | No contract change |
| P-05 | Every state change is recorded in the event log | n/a | No OMS state |
| P-06 | Kafka only through the transactional outbox | n/a | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database |
| P-08 | Concurrency and idempotency are explicit | n/a | Read-only view over loaded summaries; no writes |
| P-09 | Commands and queries stay separate | n/a | No commands; the view only reads |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No order state |
| P-11 | Layering and conventions | comply | A pure helper in `lib/spec-tickets.ts`, presentational components in `views/dashboard`, shared store state for filters, colour tokens in `globals.css`, as in SPEC-0006 |
| P-12 | Jackson 3 only | n/a | No Java |
| P-13 | Errors and validation follow the framework specs | comply | The existing load-error alert stays; the overview never presents an error as an empty portfolio (AC-7) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Each AC is mapped to a vitest test above; tests are written first in each task |
| P-15 | Observability | n/a | Pure UI; no new flows or logs needed |
| P-16 | Security | n/a | No input from outside, no IPC change |
| P-17 | Simplicity and dependencies | comply | Plain SVG, no chart library; the colour test needs no new package |
| P-18 | Modules build standalone | comply | `developer-cockpit` typecheck, test and build |
| P-19 | Documentation follows behaviour | comply | `developer-cockpit/spec/03-features.md` §1; no `oms-knowledge-base/` page covers the dashboard layout |

## Knowledge Base Updates

None in `oms-knowledge-base/`: no page there describes the cockpit dashboard's layout. The cockpit
spec page `developer-cockpit/spec/03-features.md` §1 Dashboard is updated in this ticket.
