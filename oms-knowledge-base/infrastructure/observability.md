---
type: Architecture
title: "Observability"
description: "The Grafana LGTM stack of the OMS: services push traces, logs and metrics over OTLP to Grafana Alloy, which feeds Tempo, Loki and Mimir; Grafana shows the provisioned OMS dashboards and links traces to logs and metrics."
tags: [infrastructure, observability, telemetry, grafana, opentelemetry, logs, traces, metrics]
status: draft
updated: "2026-11-14T12:00:00Z"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:docker-compose.yml"
  - resource: "repo:oms-core/alloy-config.alloy"
  - resource: "repo:oms-core/grafana/dashboards/oms-overview.json"
  - resource: "repo:oms-core/grafana/dashboards/oms-services.json"
  - resource: "repo:oms-core/scripts/lgtm-smoke-test.ps1"
  - resource: "repo:oms-core/src/main/resources/application.yml"
---
# Observability

```mermaid
flowchart LR
  core[oms-core] & stream[streaming-service] & sim[exchange-simulator] & mcp[mcp-server] -->|OTLP/HTTP 4318| alloy[Grafana Alloy]
  infra[infrastructure containers] -->|stdout via docker.sock| alloy
  alloy --> tempo[(Tempo: traces)]
  alloy --> loki[(Loki: logs)]
  alloy --> mimir[(Mimir: metrics)]
  tempo & loki & mimir --> grafana[Grafana :3000]
  agents([AI assistants]) -->|MCP| gmcp[grafana-mcp :8096] --> grafana
```

The four Java services **push** all three signals over OTLP/HTTP to Alloy when
`OTLP_EXPORT_ENABLED=true` (compose sets it). Alloy is the only agent: it forwards to Tempo, Loki and
Mimir and also ships the stdout of the infrastructure containers to Loki (the services' own logs
arrive over OTLP, not stdout). Nothing scrapes `/actuator/prometheus` any more. Every series, stream
and trace is labelled `service_name` (`oms-core`, `oms-exchange-simulator`, …); Mimir series also
carry `job="oms/<service>"`. How a service produces its telemetry:
[Logging and Tracing](../architecture/patterns/logging-and-tracing.md).

## Logs

Loki (3100). Each line carries the trace and span ids and the MDC (`commandId`, `correlationId`),
so Grafana jumps from a log line to its trace. Query by `service_name`.

## Traces

Tempo (3200, API only; OTLP arrives from Alloy inside the network). Sampling is 1.0 in compose and
0.1 by default elsewhere (`TRACING_SAMPLING_PROBABILITY`). HTTP and Kafka hops continue a trace; the
transactional outbox starts a new one, so a business flow is followed by `correlationId`.

## Metrics

Mimir (9009, Prometheus API under `/prometheus`). oms-core's order-flow metrics include
`oms_order_events{event}`, `oms_orders_by_state{state}`, `oms_executions_quantity_*{side}`, the SLA
histograms `oms_order_time_to_ack`, `oms_order_oms_processing_time`, `oms_order_market_round_trip`,
and outbox pending, stuck and oldest-age gauges ([Order SLA Monitoring](../capabilities/order-sla-monitoring.md)).

## Dashboards

Provisioned read-only from `oms-core/grafana/dashboards/*.json` into the OMS folder:
- **OMS Overview** (`oms-overview`): order events per second, orders by state, fills and filled
  quantity by side, commands consumed, SLA latency p99, outbox health, end of day, warnings and
  errors.
- **OMS Services** (`oms-services`): per service, HTTP requests, errors and p95 latency, JVM
  memory, CPU, threads and Kafka records consumed.

A dashboard drafted through the Grafana MCP server is kept by exporting its JSON into that folder.

## Checking it

`powershell -File oms-core/scripts/lgtm-smoke-test.ps1` sends traffic and checks that traces, logs and
metrics arrive (exit 0 when every check passes). See also
[NFR-007 Observability](../capabilities/non-functional-requirements/NFR-007-observability.md).
