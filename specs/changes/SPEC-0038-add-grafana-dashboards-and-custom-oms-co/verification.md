# Verification — SPEC-0038: Add Grafana dashboards and custom oms-core metrics

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The oms-core suite passed in full after the last change (`build/test-results/test/TEST-*.xml`, no
failures or skips) and in `spec verify` (evidence/oms-core-1.log). The live checks are in the
compose stack's smoke run, which exited 0 with "ALL CHECKS PASS".

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Create, accept, two fills count exactly NEW_ORDER/ACK/PARTIAL_FILL/FILL +1; refused commands count nothing | `OrderFlowMetricsIntegrationTest#eventsAreCountedOncePerAppendedEvent` checks the delta for all 10 events. `#refusedCommandsAreNotCounted` covers a second accept on a LIVE order (awaited as `refused`) and a duplicate `execId` (REST status not 201): all counts unchanged. `OrderFlowMetricsTest#recordsAfterCommitOnly`, `#recordsNothingOnRollback` | PASS |
| AC-2 | Gauge per state equals the `orders` rows; an empty state reads 0 | `OrderFlowMetricsIntegrationTest#ordersByStateMatchesTheOrdersTable` creates LIVE, FILLED and CXL orders itself, asserts NEW has no rows, and compares every state's gauge with the table. `OrderFlowMetricsTest#ordersByStateReadsTheRepository` | PASS |
| AC-3 | A BUY fill of q: `oms.executions.quantity{side=BUY}` count +1, total +q; duplicate records nothing | `OrderFlowMetricsIntegrationTest#fillQuantityIsRecordedPerSide` (q = 25; the duplicate is refused and nothing changes) | PASS |
| AC-4 | "OMS Overview" and "OMS Services" in folder OMS under fixed uids, from repository JSON, only the provisioned datasources | `GrafanaDashboardsTest#dashboardsAreProvisionedFromTheRepository` (provider folder, path, read-only; uids; every panel, target and variable datasource uid). Smoke S38-AC-4: `/api/search` lists `oms-overview` and `oms-services` in folder "OMS" | PASS |
| AC-5 | Every Mimir query of both dashboards returns ≥ 1 series; `oms_order_events` shows NEW_ORDER, ACK, FILL | Smoke S38-AC-5: all 23 Mimir targets return series, fallback queries checked without their fallback; `oms_order_events` > 0 for NEW_ORDER, ACK and FILL. `GrafanaDashboardsTest#everyOmsMetricInTheDashboardsExists` (every `oms_` name maps to a registered meter) | PASS |
| AC-6 | MCP `initialize`, `tools/list` has the dashboard search, search "OMS" returns both uids; `.mcp.json` registers it | Smoke S38-AC-6: initialize OK, 79 tools including `search_dashboards`, `search_dashboards("OMS")` returns both uids; `.mcp.json` `grafana` → `http://localhost:8096/mcp` | PASS |
| AC-7 | All oms-core tests pass; existing metric names unchanged | Full oms-core suite green. The diff renames no meter. The end-of-day counters keep their names and tags (`EndOfDayMetricsTest#seriesExistFromStartup`, and `OrderFlowMetricsIntegrationTest#endOfDaySeriesExistAtStartup` in the Spring context) | PASS |

## Goal Assessment

The goal asked for three things, and each was exercised in the running stack:
- **A Grafana MCP client, set up and tested against Grafana.** The `grafana-mcp` service is
  registered in `.mcp.json`; the smoke test drives it over MCP and finds the dashboards.
- **Dashboards.** "OMS Overview" and "OMS Services" are provisioned from the repository, and every
  query in them returns data.
- **Custom oms-core metrics.** Order events by type, orders by state, and filled quantity by side.
  They are exact: counted after commit, nothing for refused or rolled-back commands.

The requester's idea of building dashboards *via* the MCP client was resolved at the proposal:
dashboards are kept as code, and the MCP server is the tool to explore and draft them. A drafted
dashboard is kept by exporting it into the repository. No dashboard was drafted through MCP in this
ticket; the server's write tools are available for that.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract change |
| P-02 | Specification before code, generated models only | N/A | No API or message model change |
| P-03 | Never edit generated code | PASS | None touched |
| P-04 | Contracts evolve compatibly | N/A | No contract change |
| P-05 | Every state change is recorded in the event log | PASS | The appender writes the event and outbox rows as before; metrics observe them afterwards |
| P-06 | Kafka only through the transactional outbox | N/A | No publishing change |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change; `countByState` uses `idx_orders_state` |
| P-08 | Concurrency and idempotency are explicit | PASS | Recorded `afterCommit` only (rollback tested); duplicates and refused commands never reach the appender (tested) |
| P-09 | Commands and queries stay separate | PASS | The gauge is a read-only count off the command path |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions |
| P-11 | Layering and conventions | PASS | `service.metrics.OrderFlowMetrics`; derived repository query; dashboards next to the datasource provisioning |
| P-12 | Jackson 3 only | PASS | `GrafanaDashboardsTest` uses `tools.jackson.databind` |
| P-13 | Errors and validation follow the framework specs | N/A | No error path changes |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Unit and integration tests were written red first; AC-4..6 live by the scripted smoke test |
| P-15 | Observability | PASS | Business metrics with fixed, small label sets; dashboards over metrics, logs and traces |
| P-16 | Security | PASS | No new secret: the MCP server reuses compose's local admin password and is published on loopback only (`127.0.0.1:8096`) with a Host allowlist |
| P-17 | Simplicity and dependencies | PASS | No new Java dependency; one compose service and one mount, recorded in design.md. The R10 warnings on the `build.gradle` files come from SPEC-0033's uncommitted changes in the same tree |
| P-18 | Modules build standalone | PASS | `spec verify` ran `check` in oms-core |
| P-19 | Documentation follows behaviour | PASS | order-sla-monitoring (metrics table, dashboards), NFR-007 (dashboards, MCP server), CLAUDE.md Monitoring |

## Independent Review

The spec-reviewer agent's verdict was **MET**, with six minor findings:
1. *The AC-2 test relied on other tests' rows.*
   - Fixed: it now creates LIVE, FILLED and CXL orders and asserts the always-empty NEW state reads 0.
2. *Fallback queries always pass.*
   - Fixed: S38 checks each fallback query without `or on() vector(0)` for oms-core.
   - The server-errors query is checked without its `outcome` filter, which still proves the metric
     exists.
3. *`EndOfDayMetricsTest` calls `registerMeters()` by hand.*
   - Added `OrderFlowMetricsIntegrationTest#endOfDaySeriesExistAtStartup`, which checks the series
     in the Spring context.
4. *The MCP server was published on all interfaces.*
   - Fixed: `127.0.0.1:8096:8000`.
   - Write tools stay on: drafting dashboards is the approved purpose.
5. *The duplicate-fill status was not asserted.*
   - Fixed: `assertNotEquals(201, …)` in both places.
6. *verification.md and evidence were pending.*
   - This file. `spec verify` was re-run after the fixes.

## Automated Evidence

`node specs/tools/spec.mjs verify SPEC-0038` (evidence/last-run.json): the policy check passed.
`gradlew check` in oms-core exited 0 (evidence/oms-core-1.log).

The LGTM smoke test was run against the compose stack after the review fixes, and exited 0 with
every S38 check passing.

## Follow-ups

- **Alert rules:** for example SLA p99, stuck outbox rows, end-of-day failures, and order
  rejections per minute.
- **A bounded `exDestination` tag** on the order-event and fill metrics, once routing sets it.
- **An image renderer** for the MCP server's panel images, if wanted.

## Verdict

Verdict: GOAL MET
