# Design — SPEC-0017: Merge signals into ticket progress card

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

All files are under `developer-cockpit/src/renderer/`.

- **`views/dashboard/SpecOverview.tsx`** renders `KpiTiles`, then a two-column grid,
  `lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start`. The grid holds:
  - the *Ticket progress* card (`StageDonut`, or "Tickets could not be loaded." when
    `unavailable`);
  - `<SignalsPanel/>`.
- **`views/dashboard/SignalsPanel.tsx`** (SPEC-0016) is a `Card role="region" aria-label="Signals"`
  with two sections:
  - `YourTurn`: `section aria-label="Your turn"`, a `max-h-40` list;
  - `Activity`: `section aria-label="Activity"`, an `<ol>` of `collectSignals(tickets)` in a
    `max-h-[22rem]` scroll box. Each row has `data-level` and `data-new` and opens its ticket.

  When unavailable, it shows "Signals are unavailable: tickets could not be loaded.".
- **`stores/signals.ts`** (zustand) holds `initialized`, `known`, `fresh`, `unseen` and `toasts`.
- **`components/layout/StatusBar.tsx`**: `SignalsIndicator`, whose click calls
  `setActiveView('dashboard')` and `markSeen()`.
- **Tests:**
  - `test/renderer/SignalsPanel.test.tsx` renders `<SignalsPanel/>`.
  - `test/renderer/Dashboard.test.tsx` queries the regions *Signals*, *Activity* and *Your turn*.
  - `test/renderer/SignalsShell.test.tsx` covers the status bar and the toasts.
- **Closest example:** SPEC-0015's filter chip and SPEC-0016's panel. Both are presentational and
  read the shared stores.
- **Read:** the proposal, `developer-cockpit/spec/03-features.md` §1, and the SPEC-0016 T-6
  screenshots, which show the tall *Signals* card.

## Approach

### Layout (`SpecOverview.tsx`)

```
KpiTiles
┌ Ticket progress (Card, region "Ticket progress", full width) ─────────────────────┐
│ grid lg:[minmax(0,3fr)_minmax(0,2fr)] gap-6                                        │
│   StageDonut (or "Tickets could not be loaded.")   │  YourTurn (or "Signals are     │
│                                                    │  unavailable.")                │
├─ border-t ─────────────────────────────────────────────────────────────────────────┤
│ ActivityBar   ▸ Activity · 2 new · ✖ CRITICAL 11:00 SPEC-0004 verify run: fail     │
│ (expanded: ActivityFeed, full width, max-h-[22rem] scroll)                         │
└────────────────────────────────────────────────────────────────────────────────────┘
TicketTable
```

- The outer two-column grid goes away. The card is full width.
- Below `lg`, the inner grid stacks: the donut, then *Your turn*.
- *Your turn* sits at the right column's top, with a left border (`lg:border-l lg:pl-6`) to
  separate it from the legend.
- When `unavailable`:
  - the left column keeps "Tickets could not be loaded.";
  - the right column shows "Signals are unavailable.";
  - no *Activity* bar is rendered (AC-6).

### Components (`views/dashboard/SignalsPanel.tsx` → renamed `Signals.tsx`)

- **`YourTurn`** is exported unchanged.
- **`ActivityBar({ tickets })`** is exported. It replaces `Activity` and includes the feed:
  - It computes `signals = collectSignals(tickets)` and `newCount` (the number of `signals` whose
    key is in `fresh`).
  - **Empty:** with no signals, it renders a non-interactive row "No activity yet." with no
    button (AC-6).
  - **Otherwise:** a `<button aria-expanded={expanded} aria-controls="activity-feed">` across the
    full width shows:
    - a chevron (`ChevronRight`, rotated 90° when expanded);
    - **Activity**;
    - a "*n* new" pill when `newCount > 0`;
    - a summary of `signals[0]`: the level icon, the uppercase level label, the time, the ticket id
      in mono, and the event text, truncated.
  - The button toggles `expanded` in the store. Enter and Space work because it is a native
    button.
  - **Expanded:** `<section id="activity-feed" aria-label="Activity">` with the SPEC-0016 `<ol>`
    rows, unchanged (including `data-level` and `data-new`).
  - **Collapsed:** the section is not rendered, so no feed rows are in the DOM (AC-2).
- **`SignalsPanel`** is removed. The `Signals` card and its title go away (AC-1).
- **Rename:** the file is renamed to `views/dashboard/Signals.tsx`, because it no longer holds a
  panel. The test follows as `test/renderer/Signals.test.tsx`.

### Store (`stores/signals.ts`)

```ts
activityExpanded: boolean;                    // false initially; session only
setActivityExpanded: (expanded: boolean) => void;
```

- The state lives in the store, not in component state, so that:
  - it survives live refreshes and leaving and returning to the Dashboard (AC-4);
  - the status bar can set it.

### Status bar (`components/layout/StatusBar.tsx`)

- `SignalsIndicator` also calls `setActivityExpanded(true)` before navigating (AC-5).

### Mapping to the proposal

| What Changes | Where |
|---|---|
| One full-width Ticket progress card with donut, legend and Your turn | `SpecOverview.tsx` |
| Collapsible Activity bar with summary | `Signals.tsx#ActivityBar` |
| Expanded state kept for the session | `stores/signals.ts` |
| Status-bar click opens the Dashboard expanded | `StatusBar.tsx` |

## Contract Changes

None. This is a renderer-only layout change.

## Data & Persistence

None. The expanded state is in memory for the session (proposal decision).

## Events & Messaging

None. The existing live refresh is unchanged.

## Domain, State & Orchestration

None. There is no OMS state, and signal derivation is unchanged.

## Alternatives & Decisions

- **Layout:** the requester chose the full-width card. The other two options (keeping two columns,
  or a strip in the card header) were rejected by the requester.
- **Expanded state in the signals store, not `useState`.** Component state is lost when the user
  leaves the Dashboard (the view unmounts), and the status bar could not open the feed. Rejected:
  `localStorage`, because the proposal keeps the state for the session only.
- **Feed rows not rendered while collapsed**, rather than hidden with CSS. The tests can then prove
  "no feed entries" with role queries, and screen readers skip the hidden content. The button's
  `aria-expanded` and `aria-controls` describe the relationship.
- **No bar when there is no activity.** A disabled button would announce a control that never
  does anything. A plain "No activity yet." row is clearer.
- **The file is renamed to `Signals.tsx`.** Its name should match its content. There is no
  dependency change (P-17).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| The summary line overflows on narrow windows | It truncates with `min-w-0 truncate`; checked in a T-5 screenshot at 900 px |
| Existing SPEC-0016 tests query the *Signals* region or the feed without expanding | They are updated in the same tasks to the new structure. Their assertions about content, order, levels and *new* markers are kept, after expanding |
| The status bar expands the feed while the Dashboard is not mounted | The state is in the store, so the Dashboard reads it on mount (AC-5 test) |

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | component | `test/renderer/Dashboard.test.tsx#ticket progress card holds donut, your turn and activity` | Inside region *Ticket progress*: the donut group, region *Your turn* and the *Activity* button; no region *Signals* |
| AC-2 | component | `test/renderer/Signals.test.tsx#activity starts collapsed with a summary of the latest entry` | `aria-expanded="false"`; text "2 new", the level label, time, id and text of the newest entry; no region *Activity* and no feed rows |
| AC-3 | component | `Signals.test.tsx#clicking the bar expands and collapses the feed`; `Dashboard.test.tsx#signals feed lists entries newest first when expanded` | Rows with `data-level` and `data-new`, newest first; `aria-expanded` toggles; a second click hides the feed |
| AC-4 | component | `Dashboard.test.tsx#live refresh adds a new activity entry marked new` (extended: expand first, stays expanded); `Dashboard.test.tsx#activity stays expanded after leaving and returning` | Still expanded after the event, with the new row on top; unmount and remount keeps it expanded |
| AC-5 | component | `test/renderer/SignalsShell.test.tsx#status bar counts new critical and attention signals and opens the dashboard` (extended) | After the click, `activityExpanded` is true, and a Dashboard rendered afterwards shows the feed |
| AC-6 | component | `Signals.test.tsx#no activity: a plain row, nothing to expand`; `Dashboard.test.tsx#shows load errors instead of an empty portfolio` (extended) | "No activity yet." with no button; on a load error, "Signals are unavailable." with no "Nothing needs you." and no Activity bar |

Visual check: a one-off Playwright screenshot of the built app, light and dark, with the bar
collapsed and expanded, at 1440 and 900 px.

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contracts |
| P-02 | Specification before code, generated models only | comply | The proposal (approved) and the design come before the code |
| P-03 | Never edit generated code | n/a | No generated code |
| P-04 | Contracts evolve compatibly | n/a | No contract or IPC change |
| P-05 | Every state change is recorded in the event log | n/a | No OMS state |
| P-06 | Kafka only through the transactional outbox | n/a | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database |
| P-08 | Concurrency and idempotency are explicit | n/a | A UI toggle in a session store; nothing concurrent |
| P-09 | Commands and queries stay separate | n/a | Read-only view |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No order state |
| P-11 | Layering and conventions | comply | Presentational components in `views/dashboard`, session UI state in the existing zustand store |
| P-12 | Jackson 3 only | n/a | No Java |
| P-13 | Errors and validation follow the framework specs | comply | A load error still shows the alert, and the card never presents empty states as data (AC-6) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Every AC is mapped above; each task writes or updates its test first |
| P-15 | Observability | n/a | Pure UI |
| P-16 | Security | n/a | No new input, no file or IPC access |
| P-17 | Simplicity and dependencies | comply | No new package; the expand control is a native button with `aria-expanded` |
| P-18 | Modules build standalone | comply | `developer-cockpit` typecheck, tests and build |
| P-19 | Documentation follows behaviour | comply | `developer-cockpit/spec/03-features.md` §1 and `02-information-architecture.md` |

## Knowledge Base Updates

None in `oms-knowledge-base/`: no page there covers the cockpit. The cockpit spec pages are updated:
`developer-cockpit/spec/03-features.md` §1 (the Dashboard rows) and `02-information-architecture.md`.
