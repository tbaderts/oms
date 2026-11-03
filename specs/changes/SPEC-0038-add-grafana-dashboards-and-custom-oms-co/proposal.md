# Proposal — SPEC-0038: Add Grafana dashboards and custom oms-core metrics

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

[Ticket Goal](./ticket.md): there are no Grafana dashboards yet. The goal asks to:
- set up a Grafana MCP client and test the Grafana integration through it;
- build dashboards;
- add custom oms-core metrics, so the dashboards have business data points to show.

**Today (after SPEC-0031/0032/0033):**
- **Grafana is empty.** It runs in docker-compose with Mimir, Loki and Tempo provisioned as
  datasources (`oms-core/grafana/provisioning/datasources/oms.yml`), but there is no dashboard. To
  see anything, an operator writes PromQL or LogQL by hand in Explore.
- **All four services push their telemetry.** Since SPEC-0033 they send metrics, traces and logs
  over OTLP, labelled by `service_name`.
- **oms-core's own metrics are about plumbing:**
  - `oms.commands.consumed{type,outcome}` (Kafka commands);
  - the SLA timers `oms.order.time_to_ack|oms_processing_time|market_round_trip|time_to_market`;
  - the outbox gauges `oms.outbox.pending|stuck|oldest.age`;
  - `oms.end-of-day.orders|failures{step}` and `oms.projection.rebuild`;
  - `@Observed` timers of the command processors.
- **Nothing shows what the OMS does with orders.** There is no count of order events (new, acked,
  filled, cancelled, rejected, expired, closed) whatever their source (REST or Kafka), no view of
  how many orders sit in each state, and no measure of filled quantity.
- **No AI assistant can see Grafana.** `.mcp.json` registers only the OMS and Mastra MCP servers,
  so an assistant can't search, read or build dashboards, or query the datasources through Grafana.

**Cost of doing nothing:** every look at the system's behaviour stays a hand-written query.
Dashboards stay unversioned when someone does build one in the UI. The SPEC-0033 telemetry is
collected but not put to use.

## What Changes

- **New oms-core metrics** (business data points, all low cardinality):
  - **Order events:** a counter of appended order events by event type (`NEW_ORDER`, `ACK`,
    `PARTIAL_FILL`, `FILL`, `CXL_REQUEST`, `CXL`, `CXL_REJ`, `REJ`, `EXP`, `CLOSE`). It counts every
    change recorded in `order_events`, whether it came over REST, Kafka or end of day.
  - **Orders by state:** a gauge per order state (`UNACK`, `LIVE`, `FILLED`, `CXL`, `REJ`, `EXP`,
    `CLOSED`, …) holding the number of orders currently in that state.
  - **Filled quantity:** a distribution of filled quantity per fill, by side, giving fills per
    second and quantity per second.
- **Dashboards, versioned in the repository** and provisioned into Grafana at startup in an "OMS"
  folder:
  - **OMS Overview (business and pipeline):**
    - order events per second by type, orders by state, fills and filled quantity;
    - commands consumed by type and outcome;
    - SLA latency percentiles;
    - outbox pending, stuck and oldest age;
    - end-of-day orders and failures;
    - recent error log lines from Loki.
  - **OMS Services (runtime), for each of the four services selectable by `service_name`:**
    - HTTP request rate, errors and latency;
    - JVM memory, CPU and threads;
    - Kafka consumer records and lag;
    - a link to the service's traces in Tempo.
- **A Grafana MCP server** (Grafana Labs' `mcp-grafana`):
  - it runs in docker-compose next to Grafana and is registered in `.mcp.json`;
  - an AI assistant can then search and read dashboards, query Mimir/Loki/Tempo through Grafana,
    and draft new dashboards;
  - a dashboard drafted this way is kept by exporting its JSON into the repository.
- **Checks:**
  - the LGTM smoke test checks that the dashboards are provisioned and that their metric panels
    return data;
  - it also checks that the MCP server answers and finds the dashboards.
- **Docs:** knowledge-base pages for the new metrics and the dashboards, and CLAUDE.md's Monitoring
  section.

No **BREAKING** changes: existing metric names, APIs, messages and data are unchanged.

## Scope

### In scope

- The three oms-core metrics above, with tests.
- The two dashboards as provisioned JSON, and the Grafana provisioning for dashboards.
- The `mcp-grafana` service in docker-compose and its `.mcp.json` entry.
- Smoke-test checks for the dashboards and the MCP server.
- Knowledge base and CLAUDE.md.

### Out of scope

- **Alerting:** alert rules, contact points, SLO burn alerts. A follow-up ticket.
- **Other services' business metrics** (simulator, streaming service). The Services dashboard
  shows their runtime metrics only.
- **Per-symbol, per-account or per-venue breakdowns.** Unbounded label cardinality; a later ticket
  can add a bounded `exDestination` tag.
- **Notional or P&L metrics.** Currencies are mixed, and money aggregates need their own design.
- **The Grafana image renderer** (MCP panel images), Grafana Cloud, and authentication beyond the
  local admin account.
- **oms-ui.**

## Acceptance Criteria

- **AC-1** — Given oms-core with a fresh meter registry, when an order is created, accepted and
  then filled in two fills, then:
  - the order-event counter has increased by exactly 1 for `NEW_ORDER`, 1 for `ACK`, 1 for
    `PARTIAL_FILL` and 1 for `FILL`;
  - a refused command (an accept for an order that is already LIVE, or a fill with a duplicate
    `execId`) increases no event count.
- **AC-2** — Given orders in several states in the `orders` table, when the orders-by-state gauge
  is read, then each state's value equals the number of rows in `orders` with that state, and a
  state with no orders reads 0.
- **AC-3** — Given a LIVE BUY order, when a fill of quantity q is applied, then:
  - the filled-quantity distribution for side `BUY` records one more observation, and its total
    grows by q;
  - a duplicate fill (same `execId`) records nothing.
- **AC-4** — Given the docker-compose stack, when Grafana starts, then Grafana's search API lists
  the dashboards "OMS Overview" and "OMS Services" in an "OMS" folder, under fixed uids.
  - Each dashboard is provisioned from a JSON file in the repository.
  - Each dashboard uses only the provisioned Mimir, Loki and Tempo datasources.
- **AC-5** — Given the compose stack after an order has gone through oms-core and the simulator,
  when the smoke test runs every Mimir query of both dashboards (with `service_name=oms-core` for
  the Services dashboard's variable), then each query returns at least one series.
  - This includes the three new metrics, with `oms.order.events` showing at least `NEW_ORDER`,
    `ACK` and `FILL` for the run.
- **AC-6** — Given the compose stack, when an MCP client calls the Grafana MCP server, then:
  - it completes the MCP `initialize` handshake on its published port;
  - `tools/list` includes the dashboard search tool;
  - a dashboard search for "OMS" returns both dashboards' uids;
  - `.mcp.json` registers the server so that Claude Code can use it.
- **AC-7** — Given the changes, when every oms-core test suite runs, then all tests pass. Existing
  metric names and tags are unchanged: the SLA timers, `oms.commands.consumed` and the outbox
  gauges keep their names.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core (metrics, Grafana provisioning, smoke test), oms-knowledge-base; also root `docker-compose.yml` and `.mcp.json` |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | None. The orders-by-state gauge reads `orders` with one grouped count per export step (15 s) |
| Events / Kafka topics | None |
| Consumers (oms-ui, oms-mcp-server, downstream) | None functionally. Grafana users and AI assistants gain dashboards and a Grafana MCP server |
| Knowledge base | Observability pages (NFR-007, the order-SLA-monitoring capability), a page for the dashboards and metrics, CLAUDE.md Monitoring |

## Open Questions

- [resolved] Should dashboards be created through the MCP server or kept as code? →
  assumption: **as code.**
  - The dashboards live as JSON files in the repository and Grafana provisions them, so they are
    versioned, reviewed and recreated with the stack.
  - The MCP server is the tool for exploring and drafting. A dashboard drafted with it is exported
    into the repository to be kept.
  - Dashboards built only in Grafana's database would be lost with the `grafana-storage` volume
    and are not reviewable.
- [resolved] How does the MCP server authenticate to the local Grafana? → assumption: with the same
  local admin account as the compose stack (`GF_SECURITY_ADMIN_PASSWORD`, default `secret`), over
  basic auth.
  - It is local-only, with no service-account token to create by hand.
  - It runs with write tools enabled, so drafting dashboards works.
- [resolved] Which MCP transport? → assumption: **streamable HTTP**, as a long-lived compose
  service on a published local port. This matches how `.mcp.json` already reaches the OMS MCP
  server, and an assistant doesn't have to start a Docker container per session.
- [resolved] Metric names. → assumption, so the design can fix them:
  - `oms.order.events{event}`;
  - `oms.orders.by_state{state}`;
  - `oms.executions.quantity{side}`.

  In Mimir they appear as `oms_order_events_total`, `oms_orders_by_state` and
  `oms_executions_quantity_*`.
