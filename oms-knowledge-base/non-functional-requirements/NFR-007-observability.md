---
type: Requirement
title: "Observable command processing"
description: "Command processing exposes metrics and traces, and logs are structured."
tags: [non-functional, observability]
status: draft
id: "NFR-007"
priority: "should"
implementation: "partial"
capability: "/capabilities/order-sla-monitoring.md"
category: "observability"
metric: "Flows with metrics and traces"
target: "Every service reports traces, metrics and logs over OTLP, with trace context across Kafka; commands traced (@Observed), outbox gauges, SLA timers; Grafana LGTM stack (Grafana, Loki, Tempo, Mimir) with the Alloy telemetry agent in docker-compose"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-02T13:40:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/OrderAcceptCommandProcessor.java"
  - resource: "repo:docker-compose.yml"
  - resource: "repo:oms-core/loki-config.yml"
  - resource: "repo:oms-core/alloy-config.alloy"
  - resource: "repo:oms-core/mimir-config.yml"
  - resource: "repo:oms-core/tempo-config.yml"
  - resource: "repo:oms-core/scripts/lgtm-smoke-test.ps1"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/sla/OrderSlaRecorderTest.java"
  - resource: "repo:oms-core/src/main/resources/application.yml"
  - resource: "repo:oms-core/src/main/resources/logback-spring.xml"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/OpenTelemetryLogging.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OtlpExportIntegrationTest.java"
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/config/KafkaConfig.java"
  - resource: "repo:oms-mcp-server/src/main/resources/logback-spring.xml"
---
# Observable command processing

| Category | Metric | Target |
|---|---|---|
| observability | Flows with metrics and traces | Every service reports traces, metrics and logs over OTLP to the Alloy agent, with trace context across Kafka; commands traced (@Observed), outbox gauges, SLA timers; Grafana LGTM stack (Grafana :3000 with provisioned Mimir/Loki/Tempo datasources and trace→log/metric links, Mimir :9009, Loki :3100, Tempo 3 :3200) fed by Alloy (OTLP :4317/:4318; stdout of the infrastructure containers), all in docker-compose (SPEC-0031, SPEC-0032, SPEC-0033) |

## How the services report (SPEC-0033)

oms-core, oms-streaming-service, oms-exchange-simulator and oms-mcp-server use Spring Boot's
`spring-boot-starter-opentelemetry`, configured the same way in each `application.yml`:

- **Switch and endpoint.** `OTLP_EXPORT_ENABLED` (default `false`) turns on all three exports.
  `OTLP_ENDPOINT` is the Alloy base URL: `http://alloy:4318` in docker-compose, and
  `http://localhost:4318` by default for host-native runs. Without the switch nothing is exported,
  as in every test.
- **Resource.** `service.name` is `oms-core`, `oms-streaming-service`, `oms-exchange-simulator` or
  `oms-mcp-server`. `service.namespace` is `oms`. `deployment.environment` comes from
  `DEPLOYMENT_ENVIRONMENT` (`local` by default, `compose` in docker-compose). Loki, Tempo and Mimir
  label everything with `service_name`. Mimir promotes the three attributes to labels and also sets
  `job="oms/<service>"`.
- **Traces.** Micrometer Observation, bridged to OpenTelemetry and exported over OTLP/HTTP.
  Sampling comes from `TRACING_SAMPLING_PROBABILITY`: 0.1 by default, 1.0 in dev and docker-compose.
- **Metrics.** Micrometer's OTLP registry pushes every 15 s. oms-core and the simulator keep
  `/actuator/prometheus` for local inspection; nothing scrapes it.
- **Logs.** Every record goes to the console, unchanged, and to OpenTelemetry's Logback appender
  (`logback-spring.xml`, connected by `OpenTelemetryLogging`). Each exported record carries:
  - severity, logger (as the scope) and thread;
  - the trace and span ids;
  - the MDC, for example oms-core's `commandId` and `correlationId` or the simulator's `orderId`.

  oms-mcp-server's stdio profiles log to the file and over OTLP, never to stdout. Alloy no longer
  ships these four services' container stdout, so each line reaches Loki once.

**Traces across Kafka.** Every Kafka template and listener is observed:
- oms-core: the outbox and dead-letter templates and the command listener;
- the simulator: its template and listener;
- the streaming service: its two reactor-kafka receivers.

Records carry a W3C `traceparent` header. The simulator's engine thread runs each task in the
context it was submitted from, so its acks and fills continue the trace of the order message they
answer. Publishing an order therefore gives a single trace:
1. oms-core's relay publishes it;
2. the simulator receives and answers it;
3. oms-core applies the answers;
4. the streaming service receives that publication too.

The updates that step 3 produces go through the outbox again, and each starts a trace of its own,
which the simulator and the streaming service continue.

**The outbox starts a new trace.** The request or command that created an order is a separate trace
from the order's publication. The relay sends from a scheduled thread, and the outbox row does not
store the trace context.

## Dashboards and the Grafana MCP server (SPEC-0038)

- **Dashboards as code.** "OMS Overview" (`oms-overview`) and "OMS Services" (`oms-services`) are
  JSON files in `oms-core/grafana/dashboards`. Grafana provisions them into the **OMS** folder,
  read-only in the UI. oms-core's order-flow metrics behind them are described in
  [Order SLA Monitoring](../capabilities/order-sla-monitoring.md).
- **Grafana MCP server.** The compose service `grafana-mcp` (Grafana Labs' `mcp-grafana`, streamable
  HTTP on `localhost:8096/mcp`, registered in `.mcp.json`) lets an AI assistant search and read
  dashboards, query Mimir, Loki and Tempo through Grafana, and draft dashboards. It signs in as the
  local Grafana admin.
- **Keeping a drafted dashboard.** A dashboard drafted through the MCP server or the UI lives only in
  Grafana's database. To keep it, export its JSON into `oms-core/grafana/dashboards`.

## Verification

Partial:
- **Tested in the suites:**
  - the SLA timers;
  - telemetry export in all four services, by each one's `OtlpExportIntegrationTest`: spans,
    metrics and log records reach an OTLP endpoint with the service's resource. In oms-core and
    the streaming service the consumer span is in the Kafka producer's trace, and oms-core's log
    records carry the MDC;
  - each service's `TelemetryConfigurationTest`.
- **Not verified automatically:** the outbox gauges.
- **Verified by `oms-core/scripts/lgtm-smoke-test.ps1`** (SPEC-0032, SPEC-0033):
  - the LGTM transport: compose services and image pins, readiness, Grafana datasources, OTLP
    through Alloy;
  - the services' own telemetry:
    - Mimir series by `service_name` for all four services;
    - Loki records with trace ids and no stdout copy;
    - a Tempo trace spanning oms-core and the simulator;
    - infrastructure stdout in Loki;
    - both dashboards provisioned, every Mimir query in them returning data, and the Grafana MCP
      server answering and finding them (SPEC-0038).

Policy P-15 governs logging.

Capability: [order-sla-monitoring](../capabilities/order-sla-monitoring.md).
