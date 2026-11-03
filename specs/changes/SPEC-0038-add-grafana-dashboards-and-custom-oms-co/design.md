# Design — SPEC-0038: Add Grafana dashboards and custom oms-core metrics

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies.

## Context

The proposal was approved without notes, so its four assumptions stand:
- dashboards are kept as code;
- `mcp-grafana` uses basic auth as the local admin, with write tools on;
- it runs over streamable HTTP as a compose service;
- the metric names are as proposed.

**Today:**
- **Event log.** Every order state change goes through `OrderEventAppender.appendOrderEvent` (and
  `appendExecutionEvent` for fills), inside the caller's transaction.
  - A duplicate fill is refused earlier, in `PersistExecutionTask`
    (`existsByOrderIdAndExecID`), so it never reaches the appender.
  - A refused lifecycle command never reaches it either (state machine, `ValidateLifecycleActionTask`).
  - A concurrent writer fails at `saveAndFlush` and rolls back.
- **Enums.** `Event` has `NEW_ORDER, ACK, PARTIAL_FILL, FILL, CXL, REJ, CXL_REQUEST, CXL_REJ, EXP,
  CLOSE`. `State` has `NEW, UNACK, LIVE, FILLED, CXL, REJ, CLOSED, EXP`. `orders.state` is indexed
  (`idx_orders_state`).
- **Existing meters.**
  - The outbox gauges in `OutboxRelay` read the repository on every collection; that is the
    existing pattern for DB-backed gauges.
  - `oms.end-of-day.orders|failures{step}` are created on first increment, in `OrderExpiryService`
    (`step=expire`) and `EndOfDayService` (`step=close`), so they don't exist until end of day has
    run.
- **Mimir naming** (SPEC-0033: OTLP push, no translation suffixes). Names arrive as sent, with dots
  turned into underscores:
  - counters have no `_total` (`oms_commands_consumed`);
  - timers and distributions arrive as `_bucket/_count/_sum/_max`; timers are in milliseconds;
  - every series carries `service_name`, `service_namespace` and `deployment_environment`.

  So the new meters will appear as `oms_order_events`, `oms_orders_by_state` and
  `oms_executions_quantity_*`. The `_total` the proposal mentioned is not added.
- **Grafana 13.3.0** in compose mounts `oms-core/grafana/provisioning` (datasources only; uids
  `oms-mimir`, `oms-loki`, `oms-tempo`). There are no dashboards.
- **`.mcp.json`** registers `mastra` (stdio) and `oms` (http `localhost:8091/mcp`).
- **`mcp-grafana`** (Grafana Labs):
  - image `grafana/mcp-grafana`;
  - transports `stdio | sse | streamable-http` (`--address`, `--endpoint-path` default `/mcp`);
  - `--allowed-hosts` for the `Host` check;
  - basic auth through `GRAFANA_USERNAME` and `GRAFANA_PASSWORD`;
  - the tool `search_dashboards`.

**Read:** NFR-007, `capabilities/order-sla-monitoring.md`, `oms-concepts/sla-measurement.md`,
SPEC-0033's design.

## Approach

**1. `OrderFlowMetrics`** (`org.example.oms.service.metrics`, `@Component`): one place for the
three new meters.

```java
public static final String ORDER_EVENTS = "oms.order.events";          // counter {event}
public static final String ORDERS_BY_STATE = "oms.orders.by_state";    // gauge   {state}
public static final String EXECUTION_QUANTITY = "oms.executions.quantity"; // summary {side}

void recordEvent(Event event)                       // after commit
void recordFill(Side side, BigDecimal lastQty)      // after commit
```

- **Counted after commit.** Both record methods run `afterCommit` through
  `TransactionSynchronizationManager.registerSynchronization` when a synchronization is active, and
  immediately otherwise. A rolled-back change (a concurrent writer, a later failure in the
  pipeline) is therefore never counted. Counting after the event's commit makes the counter exact
  for AC-1.
- **Pre-registered series.** The counter is pre-registered for every `Event` value, and the summary
  for every `Side` value. Each series then exists from startup with 0, which `rate()` and AC-5
  need, with low cardinality (10 events, 2–3 sides).
- **Orders by state.** One `Gauge` per `State` value, reading
  `OrderRepository.countByState(state)` (a derived count query, served by `idx_orders_state`) on
  each collection: 8 small counts per 15 s export step. The value is exact at read time (AC-2).
- **Filled quantity.** `DistributionSummary` `oms.executions.quantity{side}` with
  `baseUnit("shares")`, recording `lastQty.doubleValue()`. It is a metric, not money arithmetic; no
  rounding of stored values.

**2. Wiring.**
- `OrderEventAppender.appendOrderEvent` calls `orderFlowMetrics.recordEvent(event)` after the event
  row and the outbox row are written.
- `appendExecutionEvent` also calls `recordFill(order.getSide(), execution.getLastQty())`.
- The appender gets `OrderFlowMetrics` through its constructor. Its tests that build it by hand get
  a `SimpleMeterRegistry`-backed instance.

**3. End-of-day series from startup.** `OrderExpiryService` and `EndOfDayService` register their
`oms.end-of-day.orders{step}` and `oms.end-of-day.failures{step}` counters in their constructors,
keep them as fields and increment the fields. Names and tags are unchanged. The series now exist
before the first end of day, so their dashboard panels have data (AC-5).

**4. Dashboards as code.**
- `oms-core/grafana/provisioning/dashboards/oms.yml`:
  - a file provider named `oms` in folder `OMS`, path `/etc/grafana/dashboards`;
  - `allowUiUpdates: false` (edits go through the repository);
  - `updateIntervalSeconds: 30`.
- `oms-core/grafana/dashboards/oms-overview.json` (uid `oms-overview`, title "OMS Overview") and
  `oms-services.json` (uid `oms-services`, "OMS Services"). Datasources are referenced by uid
  (`oms-mimir`, `oms-loki`, `oms-tempo`); there are no `${DS_…}` inputs.
- `docker-compose.yml` mounts `./oms-core/grafana/dashboards:/etc/grafana/dashboards:ro` into
  `grafana`.
- **OMS Overview panels** (Mimir unless noted; `[$__rate_interval]`):
  - Order events/s: `sum by (event) (rate(oms_order_events{service_name="oms-core"}[…]))`
  - Orders by state: `sum by (state) (oms_orders_by_state{service_name="oms-core"})` (bar gauge)
  - Fills/s by side: `sum by (side) (rate(oms_executions_quantity_count{…}[…]))`
  - Filled quantity/s by side: `sum by (side) (rate(oms_executions_quantity_sum{…}[…]))`
  - Commands consumed/s: `sum by (type, outcome) (rate(oms_commands_consumed{…}[…]))`
  - SLA p95/p99, one panel with the four timers:
    `histogram_quantile(0.99, sum by (le) (rate(oms_order_time_to_ack_bucket{…}[…])))`, and so on
    for the other three timers.
  - Outbox: `oms_outbox_pending`, `oms_outbox_stuck`, `oms_outbox_oldest_age`
  - End of day: `sum by (step) (increase(oms_end_of_day_orders{…}[1d]))` and the same for failures.
  - Warnings and errors (Loki logs panel):
    `{service_name="oms-core"} | severity_text=~"WARN|ERROR"`
- **OMS Services:**
  - **Variable:** `service_name`, from `label_values(jvm_memory_used{service_namespace="oms"},
    service_name)`, defaulting to `oms-core`.
  - **Panels** (filtered by `service_name="$service_name"`):
    - HTTP requests/s by `uri`;
    - HTTP server errors/s, `… or vector(0)`, so the panel has a series with no errors;
    - HTTP p95 latency;
    - JVM memory used by `area`;
    - process CPU usage;
    - live threads;
    - Kafka consumer records lag by topic, `… or vector(0)` (the MCP server has no consumer);
    - Warnings and errors (Loki);
    - Recent traces: a Tempo table, TraceQL `{resource.service.name="$service_name"}`.
  - The exact HTTP and Kafka label names are confirmed against Mimir in implementation.

**5. Grafana MCP server.**
- **Compose service `grafana-mcp`:**
  - image `grafana/mcp-grafana:<pin>`; the pin is the newest release at least two weeks old, chosen
    and recorded in implementation;
  - `command: ["-t", "streamable-http", "--address", "0.0.0.0:8000", "--allowed-hosts",
    "localhost:8096,127.0.0.1:8096"]`;
  - env `GRAFANA_URL=http://grafana:3000`, `GRAFANA_USERNAME=admin`,
    `GRAFANA_PASSWORD=${GF_SECURITY_ADMIN_PASSWORD:-secret}`;
  - port `8096:8000`, `depends_on: grafana`, network `app-net`.
- **`.mcp.json`** adds `"grafana": {"type": "http", "url": "http://localhost:8096/mcp"}`.
  Claude Code picks it up in its next session.

**6. Smoke test** (`oms-core/scripts/lgtm-smoke-test.ps1`), new section `S38`:
- **Startup:** bring up `grafana-mcp`.
- **AC-4:** after the existing SPEC-0033 order flow, `GET :3000/api/search?type=dash-db&query=OMS`
  lists uids `oms-overview` and `oms-services`, both in folder "OMS".
- **AC-5:** for every target of both JSON files whose datasource uid is `oms-mimir`:
  - substitute `$__rate_interval` with `1m` and `$service_name` with `oms-core`;
  - run it as an instant query (waiting up to 90 s for fresh points);
  - require ≥ 1 series;
  - also check `oms_order_events` has `NEW_ORDER`, `ACK` and `FILL` series with a value > 0.
- **AC-6:** JSON-RPC over HTTP to `http://localhost:8096/mcp`:
  - `initialize`, keeping the `Mcp-Session-Id`;
  - `notifications/initialized`;
  - `tools/list` must contain `search_dashboards`;
  - `tools/call search_dashboards {"query": "OMS"}` must mention both uids;
  - responses may be SSE-framed (`data:` lines), and are parsed either way.

## Contract Changes

None. No OpenAPI or Avro change.

## Data & Persistence

None: no table or migration. A read-only derived query, `OrderRepository.countByState(State)`, is
added; it is served by the existing `idx_orders_state`.

## Events & Messaging

None. Events and the outbox are unchanged. The appender only reports after commit.

## Domain, State & Orchestration

None. No state machine or pipeline change; the metrics observe the appender's output.

## Alternatives & Decisions

- **Count in `OrderEventAppender`, after commit.** Rejected alternatives:
  - **In each processor or listener:** that would miss end of day or REST, and double-count paths.
  - **On the outbox relay's send:** that counts publications, which are retried and include
    projections.
  - **Synchronously inside the transaction:** a rollback would leave a phantom count.
- **A gauge read from the database, not an in-memory tally.** An in-memory tally drifts across
  restarts and instances. One grouped count per state every 15 s is cheap with the index, and it
  follows the outbox gauges' pattern.
- **Pre-registered series** for every `Event`, `Side` and end-of-day step, so panels and `rate()`
  work from startup. Every label set is fixed and small.
- **Quantity as a `DistributionSummary` without percentiles.** It gives count (fills/s) and sum
  (quantity/s) without histogram buckets; buckets for quantities have no agreed scale.
- **Dashboards as provisioned JSON, read-only in the UI** (approved assumption). A dashboard
  drafted through MCP or the UI goes to a separate folder and is exported into
  `oms-core/grafana/dashboards/` to keep.
- **`mcp-grafana` as a streamable-HTTP compose service** rather than `docker run -i … -t stdio` per
  session, matching the `oms` MCP entry. Host port 8096 is free (8090–8094 and 8091 are used).
- **P-17 build changes:** one compose service (`grafana-mcp`), one Grafana mount, and the
  `.mcp.json` entry. No new Java dependency.
- **Changed during implementation:**
  - **T-3, end-of-day counters.** They are registered in a `@PostConstruct registerMeters()` on each
    service rather than in rewritten constructors: the services keep `@RequiredArgsConstructor`.
    Micrometer returns the same counter on each later `counter(name, tags)` call, so names, tags and
    increments are unchanged.
  - **T-4, test location.** `GrafanaDashboardsTest` is in `org.example.oms.integration`, extending
    `AbstractFillFlowIntegrationTest`. It runs an order first, because the SLA timers and
    `oms.commands.consumed` are registered on first use.
  - **T-4, panel fallbacks.** Panels that may legitimately have no source series use
    `… or on() vector(0)`, which adds the 0 only when the left side is empty. These are HTTP
    errors, Kafka records and lag (the MCP server has no consumer), and requests.
  - **T-5, image pin.** The image is pinned to `grafana/mcp-grafana:2.0.2`, the newest release at
    least two weeks old (2026-10-10; 2.1.x and 2.2.0 are newer).
  - **T-5, entrypoint.** The image's entrypoint hard-codes `--transport sse`, so compose overrides
    `entrypoint` with the binary alone.
  - **T-5, sessions.** The server answers streamable HTTP without a session id, and the smoke test
    calls it stateless.
  - **After review: loopback only.** The port is published on `127.0.0.1:8096`, not on all
    interfaces, because the server signs in as the Grafana admin with write tools.
  - **After review: fallbacks checked without their fallback.** S38 runs each fallback query for
    oms-core without its `or on() vector(0)`, so a renamed metric can't pass. The server-errors
    query also drops its `outcome` filter there, since oms-core normally has no 5xx.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| The gauge's `countByState` runs on the OTLP export thread and the Prometheus scrape | 8 indexed counts per step; same pattern as the outbox gauges. Revisit with a cached snapshot if `orders` grows large |
| A pipeline rolls back after the append, so the count would be wrong | Recorded only `afterCommit`; a unit test proves a rollback records nothing |
| Dashboard queries drift from metric names | The smoke test runs every Mimir query of both dashboards; `GrafanaDashboardsTest` checks the JSON offline (uids, datasource uids, referenced `oms_` metric names exist as meters) |
| The MCP server can write to Grafana | Local stack only. Provisioned dashboards are read-only (`allowUiUpdates: false`), so the MCP server can't overwrite them; drafts go to other folders |
| `mcp-grafana`'s `Host` check rejects the client | `--allowed-hosts` lists `localhost:8096` and `127.0.0.1:8096`, as `.mcp.json` uses |
| The admin password is in the MCP container's environment | The same value compose already gives Grafana; local development only (P-16) |

## Test Strategy

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | integration | `OrderFlowMetricsIntegrationTest#eventsAreCountedOncePerAppendedEvent` (oms-core, extends `AbstractFillFlowIntegrationTest`) | Create, accept over Kafka, then two REST fills (60, 40). Deltas of `oms.order.events` are `NEW_ORDER` +1, `ACK` +1, `PARTIAL_FILL` +1, `FILL` +1, all others 0 |
| AC-1 | integration | `OrderFlowMetricsIntegrationTest#refusedCommandsAreNotCounted` | A second accept for a LIVE order and a fill with a duplicate `execId` leave every `oms.order.events` count unchanged |
| AC-1 | unit | `OrderFlowMetricsTest#recordsAfterCommitOnly` | Inside a transaction synchronization: nothing before commit; +1 after `afterCommit`; nothing after rollback. Without a transaction: immediate |
| AC-2 | integration | `OrderFlowMetricsIntegrationTest#ordersByStateMatchesTheOrdersTable` | For every `State`: the gauge equals the count of `orders` rows in that state (0 for an absent state, e.g. `NEW`) |
| AC-3 | integration | `OrderFlowMetricsIntegrationTest#fillQuantityIsRecordedPerSide` | A BUY fill of 25: `oms.executions.quantity{side=BUY}` count +1, total +25; the duplicate `execId` adds nothing |
| AC-4 | unit + e2e | `GrafanaDashboardsTest#dashboardsAreProvisionedFromTheRepository` (oms-core, Jackson 3); smoke `S38` | Offline: the provider yml points to the mounted path and folder `OMS`; both JSON files have uids `oms-overview`/`oms-services` and titles; every panel datasource uid is one of `oms-mimir`/`oms-loki`/`oms-tempo`. Live: `/api/search` lists both in folder "OMS" |
| AC-5 | unit + e2e | `GrafanaDashboardsTest#everyOmsMetricInTheDashboardsExists`; smoke `S38` | Offline: each `oms_…` name in the PromQL maps to a meter registered in the context (dots → underscores, base name for `_count/_sum/_bucket`). Live: every Mimir query returns ≥ 1 series; `oms_order_events` has `NEW_ORDER`, `ACK` and `FILL` > 0 |
| AC-6 | e2e | smoke `S38` (MCP JSON-RPC) | `initialize` OK, `tools/list` contains `search_dashboards`, the search for "OMS" returns both uids; `.mcp.json` has the `grafana` entry |
| AC-7 | integration (all suites) | the full oms-core suite, plus `EndOfDayMetricsTest#seriesExistFromStartup` | All pass. The end-of-day counters exist at startup under the unchanged names and tags; existing meter names are unchanged |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contract change |
| P-02 | Specification before code, generated models only | n/a | No API or message model change |
| P-03 | Never edit generated code | n/a | None involved |
| P-04 | Contracts evolve compatibly | n/a | No contract change |
| P-05 | Every state change is recorded in the event log | comply | Unchanged; metrics are derived from the appended events |
| P-06 | Kafka only through the transactional outbox | n/a | No publishing change |
| P-07 | Schema changes through new Liquibase changesets | n/a | No schema change; the new query uses an existing index |
| P-08 | Concurrency and idempotency are explicit | comply | Counted after commit only; duplicates and refused commands never reach the appender; tested |
| P-09 | Commands and queries stay separate | comply | The gauge is a read-only count, not on the command path |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No transitions |
| P-11 | Layering and conventions | comply | Meters in a `service.metrics` component; the repository method is a derived query; dashboards under `oms-core/grafana` next to the datasources |
| P-12 | Jackson 3 only | comply | `GrafanaDashboardsTest` reads JSON with `tools.jackson.databind` |
| P-13 | Errors and validation follow the framework specs | n/a | No error path changes |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Test Strategy; AC-4/5/6 also by the scripted smoke test, as in SPEC-0032/0033 |
| P-15 | Observability | comply | New business metrics, low-cardinality labels, dashboards over all signals |
| P-16 | Security | comply | No secrets added: the MCP server reuses compose's local admin password; it is bound to a local port with a `Host` allowlist |
| P-17 | Simplicity and dependencies | comply | No new Java dependency; one compose service; decisions above |
| P-18 | Modules build standalone | comply | oms-core only |
| P-19 | Documentation follows behaviour | comply | Knowledge Base Updates below |

## Knowledge Base Updates

- `capabilities/order-sla-monitoring.md`: the new metrics next to the SLA timers (names as in
  Mimir) and the dashboards.
- `non-functional-requirements/NFR-007-observability.md`: dashboards (provisioned, read-only), the
  Grafana MCP server, and the smoke-test coverage.
- CLAUDE.md Monitoring: dashboards (uids, folder), the `grafana-mcp` service on `localhost:8096/mcp`
  and its `.mcp.json` entry, and how to keep a drafted dashboard (export into
  `oms-core/grafana/dashboards/`).
