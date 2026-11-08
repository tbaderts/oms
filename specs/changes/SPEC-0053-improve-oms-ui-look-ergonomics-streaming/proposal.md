# Proposal — SPEC-0053: Improve oms-ui look, ergonomics, streaming limits

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

oms-ui is the admin interface and the public face of the OMS project, but it was built quickly and
looks basic: emoji glyphs as toolbar icons, ad-hoc styling per component, and no coherent design
language. Functionally, the streaming blotters are unbounded: `RSocketStreamingService` requests
`2147483647` events and `StreamingBlotter` inserts every object into a `Map` that is never evicted,
so a long-running session accumulates objects without limit and degrades the browser (memory growth,
slower renders) — the opposite of what a live blotter should do. The REST blotter already pages via
`/api/query/search`, but the page size is hard-coded to 100 and not user-configurable, and there is
no visible way to tune how much data the UI holds. Traders and ops staff spend their day in this
tool; a professional appearance and predictable memory behaviour are prerequisites for showing the
project externally. Doing nothing leaves the UI at risk of browser degradation during busy market
days and undermines the project's credibility with evaluators.

## What Changes

- Streaming blotters (orders and executions) keep a **rolling window** of objects in memory: when
  the configured maximum is reached, the oldest rows are evicted as new ones arrive. The record
  count shown in the toolbar never exceeds the configured limit.
- The window limit is **configurable** via the backend `/api/config` endpoint
  (`maxStreamingRows`), with a safe default of 2000 and a hard ceiling of a few thousand; invalid
  or missing values fall back to the default.
- The existing **mode switch** between real-time (streaming) and paging/query (REST) mode is kept
  and made explicit: switching to paging mode unsubscribes the stream and loads data from
  `/api/query/search`; switching back re-subscribes.
- Paging mode gets a **page-size selector** (e.g. 50/100/250/500, persisted per blotter in
  `BlotterStateService`), replacing the hard-coded 100. All data remains reachable page by page,
  including the partial last page.
- **Look & feel overhaul**: a shared design-token theme (colours, spacing, typography) applied
  across header, tabs, toolbars, buttons and modals; emoji glyphs in toolbars and buttons replaced
  with proper iconography/text labels; consistent status indicators for streaming state.

## Scope

### In scope

- Rolling-window eviction in `StreamingBlotter` (both order and execution variants) with a
  configurable maximum.
- `ConfigService` extension to carry `maxStreamingRows` from `/api/config` with default fallback.
- Page-size selector and persistence in the REST `Blotter`.
- Mode-switch behaviour made explicit and tested (streaming ↔ paging).
- Design-token theme and visual refresh of the app shell (header, tabs, toolbar, pagination bar,
  modals) and blotter toolbars.

### Out of scope

- Changes to oms-core APIs, the OpenAPI/Avro contracts, or any backend behaviour — the query API
  already supports `page`/`size` (max 500) and the streaming endpoint is unchanged.
- New blotters for Quotes / Quote Requests (tabs stay behind their existing feature flags).
- New features such as saved filter sets, export, or column-level aggregation.
- Replacing AG Grid or the RSocket transport.

## Acceptance Criteria

- **AC-1** — Given the streaming order blotter is connected with `maxStreamingRows` = N, when more
  than N distinct orders have streamed in, then the blotter holds exactly N rows (the oldest are
  evicted) and the toolbar record count displays N.
- **AC-2** — Given `/api/config` returns `maxStreamingRows` = 1500, when the streaming blotter
  initializes, then its window limit is 1500; given `/api/config` omits `maxStreamingRows` or
  returns a value ≤ 0, then the window limit is the default 2000.
- **AC-3** — Given the streaming blotter is connected and the user switches to paging mode, then
  the stream subscription is unsubscribed and the blotter displays data fetched from
  `/api/query/search` with `page` and `size` query parameters.
- **AC-4** — Given paging mode with page size S selected from the page-size selector, when the user
  navigates to page p, then the request to `/api/query/search` uses `size=S` and `page=p-1`, and the
  grid shows the returned rows.
- **AC-5** — Given a total count that is not a multiple of the page size S, when the user navigates
  to the last page, then the remaining rows (fewer than S) are displayed.
- **AC-6** — Given the app shell and blotter toolbars are rendered, then no toolbar or button
  contains an emoji glyph and all controls use the shared design-token classes (verified by DOM
  assertions in component tests).
- **AC-7** — Given a streaming connection error followed by a reconnect, when the stream
  re-subscribes, then the window is reset (row count ≤ N) and the event counter restarts from 0.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-ui only |
| Contracts (OpenAPI / Avro) | none — `/api/query/search` already supports `page`/`size`; `/api/config` gains an additive `maxStreamingRows` field |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui only; oms-core `/api/config` response gains an optional field (additive, no consumer broken) |
| Knowledge base | `ui/oms-admin-ui_spec.md` (blotter modes, rolling window, page size) |

## Open Questions

- [resolved] What is the default and ceiling for the streaming window? → assumption: default 2000,
  ceiling 5000 (a "few thousand max" per the goal); both configurable server-side via
  `/api/config`, reversible without contract change.
- [resolved] Is the window limit per blotter or global? → assumption: one global value from
  `/api/config` applied to every streaming blotter; per-blotter override can be added later.
- [resolved] Where does the page-size selector live and what values? → assumption: in the
  pagination bar of the REST blotter, values 50/100/250/500 (500 is the API max), persisted per
  domain object in `BlotterStateService`.
- [resolved] Does the visual refresh introduce a component library? → assumption: no new
  dependency; a design-token SCSS theme over the existing components, keeping the bundle small.
