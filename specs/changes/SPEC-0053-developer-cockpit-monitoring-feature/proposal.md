# Proposal — SPEC-0053: Developer cockpit monitoring feature

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Developers and ops currently have two disconnected ways to see what is happening in a running
oms-core: the Grafana dashboards (OTLP/Alloy export, SPEC-0033) and the cockpit's API Explorer,
which can only send commands and search orders one request at a time. There is no single place in
the cockpit where they can look at the system's pulse — how orders are in flight in each state,
how fast commands are acknowledged, how old the outbox backlog is, or whether the service is
even up. The oms-core already publishes exactly the needed signals via Spring Boot Actuator
(`health`, `metrics`, `prometheus`) with Micrometer meters (`oms.order.events`,
`oms.orders.by_state`, `oms.order.time_to_ack`, `oms.outbox.pending`, …), but the cockpit
does not read them.

The affected audience is every developer working on this repository and ops on-call: today they
leave the cockpit, open a browser to a Grafana instance (if one is even configured with
OTLP_EXPORT_ENABLED) or curl the actuator endpoints by hand. If we do nothing, this gap stays:
it is friction for every debugging session, and it pushes observability out of the developer's
primary tool.

## What Changes

- New **Monitor** view in the developer cockpit's sidebar (between Docker and API Explorer).
  No existing view or its data is changed.
- The Monitor view shows, for the oms-core configured in Settings:
  - a health status (the `/actuator/health` state, e.g. UP / DOWN / OUT_OF_SERVICE) with a
    refresh;
  - headline tiles: orders in flight by state, order events appended (rate), time-to-ack
    and time-to-market percentiles, outbox pending/stuck/oldest-age;
  - the raw `/actuator/prometheus` text in a read-only pane, so any metric is visible.
- The view polls the actuator endpoints on a fixed interval (10 s) while open and shows the
  last successful sample with a timestamp. When oms-core becomes unreachable after a successful
  read it keeps the last sample visible and marks it stale; when it is unreachable from the very
  first read it shows a clear error state with the configured URL (never a blank screen).
- No changes to oms-core, its contracts, or its data. The cockpit only consumes endpoints that
  already exist. No new IPC channels are exposed to the renderer beyond the existing cockpit
  API surface pattern.

## Scope

### In scope

- The Monitor view (renderer): status, tiles, raw prometheus pane, refresh + auto-refresh.
- A main-process service that calls the configured oms-core's `/actuator/health` and
  `/actuator/prometheus`, reusing the existing OmsHttpService base-URL plumbing (Settings
  → `infrastructure.omsCoreUrl`).
- Parsing the Prometheus text format into a small typed shape for the headline tiles.
- Unit tests for the main-process service and the parser, and component tests for the view
  per the cockpit's existing vitest setup.
- A knowledge-base page update (developer-cockpit concepts) documenting the new view.

### Out of scope

- No changes to oms-core: no new endpoints, no new metrics, no changes to the existing
  Micrometer meters or the Grafana dashboards (SPEC-0038, SPEC-0033).
- No historical time series or charting beyond the current headline values (no sparkline
  history, no trend comparison). That is a follow-up ticket.
- No authentication, proxying, or non-local (remote) oms-core support beyond what
  OmsHttpService already does (the local-host confirmation pattern applies as-is).
- No Docker-container-level metrics; the existing Docker view (SPEC-0043) stays as is.
- No changes to the spec-tickets dashboard (different concern, different data source).

## Acceptance Criteria

- **AC-1** — Given the Monitor view is open and the configured oms-core is reachable and
  reports `status: UP`, when the view loads, then it shows an "UP" health indicator within
  10 s of the last successful poll, with the endpoint URL displayed.
- **AC-2** — Given the Monitor view is open, when a poll of `/actuator/prometheus` succeeds,
  then the tile "Orders by state" shows, for every `State` value present in the
  `oms_orders_by_state` series, the state name and its current gauge value, and no state
  with a zero gauge is omitted.
- **AC-3** — Given the Monitor view is open, when a poll succeeds and the prometheus text
  contains `oms_order_events_total{event="…"} …` lines, then the "Order events" tile shows
  the sum of the `oms_order_events_total` counters and an events-per-minute rate computed
  from the counters observed so far.
- **AC-4** — Given the Monitor view is open, when a poll succeeds and the text contains
  `oms_order_time_to_ack_seconds` (histogram/summary) lines, then the "Time to ACK" tile
  shows the `p99` (or `p99.9` if present) value in milliseconds rounded to one decimal.
- **AC-5** — Given the Monitor view is open, when a poll succeeds, then the "Outbox" tile
  shows `oms_outbox_pending` count, `oms_outbox_stuck` count, and
  `oms_outbox_oldest_age_seconds` (value in seconds, shown as mm:ss).
- **AC-6** — Given the configured oms-core is not reachable (connection refused or timeout),
  when a poll fails, then the view shows an error banner stating "oms-core not reachable at
  <configured URL>" and the previous successful sample (if any) is kept visible, marked with
  its timestamp.
- **AC-7** — Given the Monitor view is open, when 10 s elapse since the last successful
  poll, then a new poll is started automatically without user interaction, and the
  "Last updated" timestamp is refreshed on success.
- **AC-8** — Given the Monitor view is open, when the user clicks the manual "Refresh"
  button, then a poll is started immediately (the 10 s timer is reset after the response
  completes).
- **AC-9** — Given the raw prometheus pane, when a poll succeeds, then it displays the full
  `/actuator/prometheus` response text (up to 5 MB) in a read-only, selectable pane; when the
  response exceeds 5 MB the pane shows the truncated text plus a "truncated" notice, never
  throwing.
- **AC-10** — Given the developer opens the cockpit sidebar, when they click "Monitor",
  then the Monitor view replaces the content area and its data does not depend on any
  other view being open (no cross-view state coupling).

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit (set via `spec set SPEC-0053 modules developer-cockpit`) |
| Contracts (OpenAPI / Avro) | none — the cockpit consumes actuator endpoints that are not part of the contracted command/query API |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none |
| Knowledge base | `oms-knowledge-base` developer-cockpit concept pages need a "Monitor" entry |

## Open Questions

- [resolved] Which endpoints does the Monitor view read? → assumption: the two actuator
  endpoints already exposed in `application.yml` (`/actuator/health`,
  `/actuator/prometheus`); no new endpoint needed, which also keeps oms-core out of scope.
- [resolved] What is the poll interval? → assumption: 10 s, matching the request timeout of
  the existing OmsHttpService, so a slow response can't stack polls; a slower cadence can be
  added later without a breaking change.
- [resolved] Which metrics map to the headline tiles? → assumption: the Micrometer meters
  that already exist (SPEC-0038 order flow metrics plus the outbox metrics from
  SPEC-0033/SPEC-0034), i.e. `oms_orders_by_state`, `oms_order_events_total`,
  `oms_order_time_to_ack_seconds`, `oms_outbox_pending`, `oms_outbox_stuck`,
  `oms_outbox_oldest_age_seconds`.
- [resolved] Should the Monitor view also show JVM/system metrics (heap, CPU) from the
  actuator's `jvm_*` prometheus series? → assumption: no, this ticket covers the OMS-domain
  metrics only (order flow + outbox, all already metered by SPEC-0038/SPEC-0033); JVM
  metrics are a follow-up ticket. The raw prometheus pane (AC-9) already exposes the `jvm_*`
  series, so nothing is hidden.
