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
target: "Commands traced (@Observed), outbox gauges oms.outbox.pending / oms.outbox.stuck, SLA timers; Prometheus, Jaeger and Loki in docker-compose"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/OrderAcceptCommandProcessor.java"
  - resource: "repo:docker-compose.yml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/sla/OrderSlaRecorderTest.java"
---
# Observable command processing

| Category | Metric | Target |
|---|---|---|
| observability | Flows with metrics and traces | Commands traced (@Observed), outbox gauges oms.outbox.pending / oms.outbox.stuck, SLA timers; Prometheus, Jaeger and Loki in docker-compose |

Partial: only the SLA timers have tests; tracing and the outbox gauges are not verified automatically. Policy P-15 governs logging.

Capability: [order-sla-monitoring](../capabilities/order-sla-monitoring.md).
