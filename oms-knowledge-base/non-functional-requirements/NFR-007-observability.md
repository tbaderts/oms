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
target: "Commands traced (@Observed), outbox gauges oms.outbox.pending / oms.outbox.stuck, SLA timers; Grafana LGTM stack (Grafana, Loki, Tempo, Mimir) with the Alloy telemetry agent in docker-compose"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-30T14:50:00Z" }
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
---
# Observable command processing

| Category | Metric | Target |
|---|---|---|
| observability | Flows with metrics and traces | Commands traced (@Observed), outbox gauges oms.outbox.pending / oms.outbox.stuck, SLA timers; Grafana LGTM stack (Grafana :3000 with provisioned Mimir/Loki/Tempo datasources and trace→log/metric links, Mimir :9009, Loki :3100, Tempo 3 :3200) fed by the Alloy agent (OTLP :4317/:4318 for host and container apps, oms-core:8090 actuator scrape, compose container logs), all in docker-compose (SPEC-0031, SPEC-0032) |

Partial: only the SLA timers have tests; tracing and the outbox gauges are not verified
automatically, and oms-core emits no spans yet because its build lacks the Spring Boot 4 tracing
modules (SPEC-0033). The LGTM transport itself (compose services and image pins, readiness,
Grafana datasource provisioning and health, the oms-core scrape into Mimir, container logs into
Loki, OTLP traces, logs and metrics through Alloy) is verified automatically by
`oms-core/scripts/lgtm-smoke-test.ps1` (SPEC-0032). Policy P-15 governs logging.

Capability: [order-sla-monitoring](../capabilities/order-sla-monitoring.md).
