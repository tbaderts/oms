# Design — SPEC-0056: Fix oms-ui streaming status and snapshot reloads

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

**oms-ui (`oms-ui/frontend/src`).**
- **Which blotter renders.** `App.tsx` renders exactly one blotter: the active tab (`orders` or
  `executions`) in the active data mode (`streaming` or `rest`). Switching either one unmounts the
  current blotter and mounts the other. Four blotters exist: `StreamingOrderBlotter`,
  `StreamingExecutionBlotter`, `OrderBlotter` and `ExecutionBlotter`. They wrap `StreamingBlotter`
  and `Blotter`.
- **`StreamingBlotter.tsx`.**
  - It gets the singleton `RSocketStreamingService`, so the connection is shared by all live
    blotters.
  - It registers a connection-state listener, and its state starts at `'disconnected'`. It never
    reads `service.getConnectionState()` when registering. This is defect 1, reproduced.
  - On every mount, its subscription effect clears the rows (`setDataMap(new Map())`) and subscribes
    with `includeSnapshot`, so the server sends its whole snapshot. This is defect 2.
  - Unmounting unsubscribes.
  - Columns: `columnConfigService.getColumnConfig(domainObject, visibleColumns)`, with the visible
    columns restored from `BlotterStateService`. The state key is shared with the REST blotter.
- **`ColumnSelector.tsx`** lists every field of the domain object's metamodel.

**oms-streaming-service.** It streams `OrderDto` and `ExecutionDto` (JSON) over RSocket.
- `OrderExecutionMapperTest#executionDtoCarriesAllBlotterDefaultColumns` pins the Execution default
  columns.
- Reproduction (proposal): every default Order and Execution column is streamed. The stream lacks
  9 Execution and 25 Order metamodel fields, `id` among them.

**Tests.**
- `StreamingBlotter.test.tsx` mocks the streaming service, covering the rolling window, reconnect
  and unsubscribe-on-unmount.
- `Blotter.test.tsx` and `App.test.js` exist.

**Specs read.** `oms-knowledge-base/ui/oms-admin-ui_spec.md`, `specs/policies/architecture-policies.md`.

## Approach

1. **Status from the first render (AC-1).** In `StreamingBlotter`'s service effect, right after
   `addConnectionStateListener`, call `handleConnectionStateChange(service.getConnectionState())`.
   The status and the Connect or Disconnect button then reflect the shared connection immediately,
   and every later change still arrives through the listener.
2. **Keep visited blotters mounted (AC-2, AC-3).**
   - `App.tsx` keeps a set of visited views, keyed by data mode and tab. It renders every visited
     view and hides the inactive ones: a wrapper with the `hidden` attribute and `display: none`.
     A view is mounted the first time it is shown and stays mounted until the app unmounts.
   - A hidden live blotter keeps its subscription, rows and counters, and keeps receiving events.
     Coming back shows them at once, with no new subscription and no empty state.
   - A hidden REST blotter keeps its page.
   - The grid resizes itself when shown again, through AG Grid's own resize observer. A
     `sizeColumnsToFit` is not needed and not added.
3. **Re-subscription stays explicit (AC-4).** The subscription effect's dependencies (filters, the
   snapshot option, the reconnect tick) are unchanged, so those still subscribe again with a fresh
   snapshot.
4. **Live mode shows only columns it can fill (AC-5, AC-6).**
   - **New `src/config/streamedFields.json`.** `{"Order": [...], "Execution": [...]}`: the metamodel
     fields the stream carries, as found in the reproduction.
   - **New `src/services/streamedFields.ts`.** `isStreamed(domain, field)` and
     `splitColumns(domain, columns)` returning `{ live, historyOnly }`.
   - **In `StreamingBlotter`.** Columns are built from `live`. When `historyOnly` is not empty, a
     note under the toolbar reads "History only: Id, Status".
   - **The column selector.** `ColumnSelector` gains an optional `availableFields` prop, which the
     live blotter passes as the streamed fields.
   - **Saved history-only columns survive.** Applying a selection in live mode merges it back into
     the saved columns. History-only columns keep their place, so paging mode still shows them.
   - **Default columns.** Every default column is streamed, so the defaults stay identical in both
     modes (AC-5).
5. **Guards against drift.**
   - **oms-ui `streamedFields.test.ts`.** The default columns of the backend metamodel are a subset
     of the streamed list. It uses the same metamodel fixture as the blotter tests, which holds the
     backend's defaults.
   - **New oms-streaming-service `StreamedFieldsTest`.** It reads the oms-ui JSON file from the
     repository (`../oms-ui/frontend/src/config/streamedFields.json`). It asserts that every listed
     field is a JSON property of `OrderDto` or `ExecutionDto`, so the UI never claims a field the
     stream does not send.
   - **New `OrderMessageMapperTest#orderDtoCarriesAllBlotterDefaultColumns`**, next to the existing
     execution test, if no equivalent exists.

## Contract Changes

None. No OpenAPI or Avro change. The streaming JSON DTOs are unchanged.

## Data & Persistence

None in the database. The browser's saved blotter state (`localStorage`) keeps its format.
History-only columns stay in it.

## Events & Messaging

None. The RSocket subscriptions are the same requests, made fewer times.

## Domain, State & Orchestration

None. This is UI-only behaviour.

## Alternatives & Decisions

- **Decision: keep visited views mounted and hidden.**
  - Rejected: a shared row store outside the components, keyed by domain, with the subscription
    owned by the store. That is more code and a second owner of the grid's data. SPEC-0057's
    batching will reshape the row handling anyway.
  - Rejected: re-subscribing without a snapshot on return. It would lose the events that arrived
    while away, breaking AC-3.
- **Decision: the streamed-field list is a JSON file in oms-ui, checked from oms-streaming-service.**
  - Rejected: deriving it at runtime from received rows. Null fields are omitted from the JSON, so a
    field could look unstreamed.
  - Rejected: a new endpoint publishing it. That is a new API for a static list.
- **No new dependency (P-17).**

## Risks & Mitigations

- **Hidden live blotters keep processing events.** CPU while hidden is bounded by the rolling window.
  SPEC-0057 makes updates cheap. At most two live blotters exist.
- **The first view is still a full snapshot.** Unchanged: SPEC-0057 bounds the snapshot. This
  ticket removes the repeat cost only.
- **Drift between the JSON list and the DTOs.** Guarded by `StreamedFieldsTest` in one direction,
  listed ⊆ sent. A field newly sent but not listed is merely hidden in live mode, which is the safe
  side.
- **Cross-module test file read (P-18).** `StreamedFieldsTest` reads a repository-relative file. It
  fails clearly if the file is missing; it does not skip.

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | component | `StreamingBlotter.test.tsx` › `shows the shared connection's current state when it mounts` | With the mocked service already `connected`, a newly mounted blotter shows Connected and a Disconnect button; a later state change (`reconnecting`, `error`) is shown too |
| AC-2 | component | `App.test.js` › `switching tabs and modes subscribes each live blotter once` | Orders → Executions → Orders → REST → live: one `subscribeToOrders` and one `subscribeToExecutions`; the Orders rows are present on return, with no empty state |
| AC-3 | component | `App.test.js` › `a hidden live blotter keeps receiving events` | Events emitted for Orders while Executions is shown appear in the Orders blotter on return, and the event counter includes them |
| AC-4 | component | `StreamingBlotter.test.tsx` › existing `re-subscribes on reconnect`, plus `re-subscribes with a snapshot when filters or the snapshot option change` | A new subscription with `includeSnapshot` per change |
| AC-5 | component + unit | `StreamingBlotter.test.tsx` › `live and paging blotters show the same default columns`, `streamedFields.test.ts`, `OrderExecutionMapperTest`, `OrderMessageMapperTest` | Same headers in the same order for both blotters with no saved state; defaults ⊆ streamed; DTOs carry every default |
| AC-6 | component + unit | `StreamingBlotter.test.tsx` › `hides history-only columns with a note`, `ColumnSelector` limited test; oms-streaming-service `StreamedFieldsTest` | Saved `id` and `status` are not shown live, the note names them, the selector does not offer them, the saved state still lists them in place; every listed field is sent by the DTO |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contract change |
| P-02 | Specification before code, generated models only | n/a | No API or model change |
| P-03 | Never edit generated code | n/a | No generated code involved |
| P-04 | Contracts evolve compatibly | n/a | No contract change |
| P-05 | Every state change is recorded in the event log | n/a | UI only; no order state changes |
| P-06 | Kafka only through the transactional outbox | n/a | No publishing |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database change |
| P-08 | Concurrency and idempotency are explicit | n/a | No command path change |
| P-09 | Commands and queries stay separate | comply | Read-only UI views; no command behaviour changes |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No state transitions |
| P-11 | Layering and conventions | comply | UI logic in components and `services/`; the streamed list in `config/` |
| P-12 | Jackson 3 only | comply | The streaming-service test uses `tools.jackson` to read the JSON |
| P-13 | Errors and validation follow the framework specs | n/a | No API change |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Table above; each new test run red first |
| P-15 | Observability | comply | The status indicator now tells the truth; the history-only note makes hidden columns visible |
| P-16 | Security | comply | No secrets, no new data |
| P-17 | Simplicity and dependencies | comply | No library; one JSON file, one small module |
| P-18 | Modules build standalone | comply | oms-ui and oms-streaming-service each build alone. `StreamedFieldsTest` reads a repository-relative file from oms-ui (test only), which is present in every checkout |
| P-19 | Documentation follows behaviour | comply | `ui/oms-admin-ui_spec.md` |

## Knowledge Base Updates

- `ui/oms-admin-ui_spec.md`:
  - the live status reflects the shared connection;
  - visited views stay mounted, so switching never reloads the snapshot;
  - which columns are history-only and how they are shown.

### Changed after the independent review

The review returned NOT MET. Keeping views mounted introduced regressions that remounting used to
hide:

1. **Shared state stays shared.** `App.tsx` passes `active` to each blotter.
   - A blotter that becomes active re-reads the saved columns and filters, the shared
     `BlotterStateService` key. It applies them only if they differ, so an unchanged filter does
     not re-subscribe.
   - Only the active blotter writes its state, so a hidden blotter's stale copy never overwrites
     the other mode's choice.
   - A paging blotter auto-refreshes only while active.
2. **Reconnect reaches every live blotter.** Each blotter remembers the last connection state.
   - On a transition into `connected`, a blotter whose subscription is gone or no longer active
     subscribes again, by bumping its reconnect tick.
   - The blotter whose Connect button started the reconnect already re-subscribes, and is
     skipped through a flag set for the duration of its reconnect.
3. **The streamed list is what the stream fills.**
   - `creationDate` is removed from Execution: the mapper never sets it.
   - `securityType` is removed from Order: the stream fills it from `securityDesc`, a different
     value.
   - `StreamedFieldsTest` now maps fully populated Avro records through the real mappers. It
     asserts every listed field is non-null in the serialized DTO, not merely declared.
4. **Tests.**
   - Blotter-level, both blotters: a blotter shown again takes the column choice the other mode
     saved meanwhile, and a hidden one does not save. Not App-level: `App.keepMounted.test.tsx`
     stubs the REST blotters and the state service.
   - Blotter-level: a saved history-only column is shown by the paging blotter (AC-6, bullet 3).
   - App-level: Connect in one live blotter re-subscribes the other.
   - `includeSnapshot` is asserted on re-subscription.
   - The AC-2 and AC-3 tests live in `App.keepMounted.test.tsx`, not `App.test.js`.

### Changed after the second independent review

The second review returned NOT MET.

1. **The paging blotter wiped the shared state on its first mount (blocking).** Its save effect,
   unguarded since before this ticket, ran before the initial read finished and saved empty
   columns and filters. Opening paging mode after working live therefore lost the saved choice,
   and the live blotter's re-read then dropped its filter and reloaded the snapshot.
   - Fix: the save effect waits for `initialized`, as the live blotter's already did.
   - The blotter tests' state mocks now persist like the real service (what is saved is what the
     next read returns). The existing AC-6 paging test fails against the old code with them.
2. **No second subscription after Disconnect.** The subscribe effect clears the "subscribe when the
   connection comes back" flag when it starts, since it subscribes itself. A run superseded while
   awaiting `connect()` does not subscribe.
3. **A failed connect subscribes when the connection comes back.** The effect's catch sets the
   flag, so the service's own reconnect leads to a subscription instead of Connected over nothing.
4. **Filters are compared in their saved form** (`sameSavedFilters` in `filterUtils.ts`). The
   saved form drops a BETWEEN upper bound, so comparing the restored form made every BETWEEN
   filter look changed and reloaded the snapshot. Losing the bound in saved state predates this
   ticket and is a follow-up.
5. **Test gaps closed:**
   - the filter path of the re-read;
   - `includeSnapshot` per subscription (AC-4);
   - exactly one re-subscription per blotter after a reconnect;
   - the knowledge base describes the shared state and every re-subscribe trigger.

### Changed after the third independent review

The third review returned MET, with one minor regression exposed by the save guard. The live
blotter saves no paging (`pageSize` and `currentPage` 0). The paging blotter used to overwrite
that before reading it; now it reads it, and showed "Page 0" and requested page -1. A saved
`currentPage` below 1 now starts on page 1, as a saved `pageSize` of 0 already kept the default.

### Changed after a browser check

The `.blotter-view` wrapper that keeps views mounted had no height. A blotter's `height: 100%` then
resolved against an auto-height parent, and the grid collapsed to 1.6 px, so no rows were visible
in either mode. The wrapper now has `height: 100%` (`App.scss`). The jsdom tests do no layout and
could not see it; the evidence is a check in the running dev build.
