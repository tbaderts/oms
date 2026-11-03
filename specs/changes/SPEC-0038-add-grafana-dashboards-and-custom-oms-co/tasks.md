# Tasks — SPEC-0038: Add Grafana dashboards and custom oms-core metrics

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes.

## Tasks

### Metrics (oms-core)

- [x] **T-1** Write `OrderFlowMetricsTest` (after-commit recording, rollback records nothing, immediate without a transaction, pre-registered series); add `OrderFlowMetrics` with the event counter, the per-side quantity summary and the per-state gauges, and `OrderRepository.countByState` (AC-1, AC-2, AC-3)
  - files: oms-core/src/main/java/org/example/oms/service/metrics/OrderFlowMetrics.java, oms-core/src/main/java/org/example/oms/repository/OrderRepository.java, oms-core/src/test/java/org/example/oms/service/metrics/OrderFlowMetricsTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.metrics.OrderFlowMetricsTest'` passes
- [x] **T-2** Write `OrderFlowMetricsIntegrationTest` (events counted once, refused commands not counted, orders by state equal the table, fill quantity per side, duplicate fill not recorded); wire `OrderFlowMetrics` into `OrderEventAppender` and fix the appender's hand-built test instances (AC-1, AC-2, AC-3)
  - files: oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java, oms-core/src/test/java/org/example/oms/integration/OrderFlowMetricsIntegrationTest.java, tests constructing OrderEventAppender
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.OrderFlowMetricsIntegrationTest'` passes
- [x] **T-3** Write `EndOfDayMetricsTest#seriesExistFromStartup`; register the end-of-day counters in the constructors of `OrderExpiryService` and `EndOfDayService`, with names and tags unchanged (AC-5, AC-7)
  - files: oms-core/src/main/java/org/example/oms/service/endofday/OrderExpiryService.java, oms-core/src/main/java/org/example/oms/service/endofday/EndOfDayService.java, oms-core/src/test/java/org/example/oms/service/endofday/EndOfDayMetricsTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.service.endofday.*'` passes

### Dashboards

- [x] **T-4** Write `GrafanaDashboardsTest`; add the dashboard provider and the two dashboard JSON files; confirm the HTTP and Kafka label names against Mimir (AC-4, AC-5)
  - files: oms-core/grafana/provisioning/dashboards/oms.yml, oms-core/grafana/dashboards/oms-overview.json, oms-core/grafana/dashboards/oms-services.json, oms-core/src/test/java/org/example/oms/integration/GrafanaDashboardsTest.java
  - verify: `cd oms-core && ./gradlew test --tests 'org.example.oms.integration.GrafanaDashboardsTest'` passes

### Stack wiring

- [x] **T-5** Compose: mount the dashboards into `grafana`; add the `grafana-mcp` service (pinned image, streamable HTTP, port 8096); add the `grafana` entry to `.mcp.json` (AC-4, AC-6)
  - files: docker-compose.yml, .mcp.json
  - verify: `docker compose config --quiet` exits 0; after `docker compose up -d grafana grafana-mcp`, `/api/search?query=OMS` on :3000 lists both uids and an MCP `initialize` on :8096/mcp answers
- [x] **T-6** Smoke test section S38 (dashboards provisioned, every Mimir query returns data, `oms_order_events` has NEW_ORDER/ACK/FILL, MCP initialize, tools/list and search_dashboards), run against the rebuilt stack (AC-4, AC-5, AC-6)
  - files: oms-core/scripts/lgtm-smoke-test.ps1
  - verify: `docker compose up -d --build oms-core`, then `powershell -File oms-core/scripts/lgtm-smoke-test.ps1` exits 0

### Regression and docs

- [x] **T-7** Run the full oms-core suite (AC-7)
  - files: (none)
  - verify: `cd oms-core && ./gradlew test` passes
- [x] **T-8** Knowledge base and CLAUDE.md: order-sla-monitoring, NFR-007, CLAUDE.md Monitoring
  - files: oms-knowledge-base/capabilities/order-sla-monitoring.md, oms-knowledge-base/non-functional-requirements/NFR-007-observability.md, CLAUDE.md
  - verify: the pages name `oms_order_events`, `oms_orders_by_state`, `oms_executions_quantity`, the dashboard uids and `localhost:8096/mcp`
- [x] **T-9** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0038` exits 0

## Notes

- T-5 and T-6 need the docker stack; no other task does.
