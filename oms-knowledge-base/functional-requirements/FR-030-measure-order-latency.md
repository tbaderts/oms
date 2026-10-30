---
type: Requirement
title: "Measure order latency at SLA checkpoints"
description: "The OMS stamps received, ack, market-send and market-ack checkpoints on each order once and records time-to-ack, processing, market round-trip and time-to-market timers."
tags: [functional, order-sla-monitoring]
status: draft
id: "FR-030"
priority: "should"
implementation: "implemented"
capability: "/capabilities/order-sla-monitoring.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/sla/OrderSlaRecorder.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/004-sla-timestamps.yaml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/sla/OrderSlaRecorderTest.java"
---
# Measure order latency at SLA checkpoints

Metrics `oms.order.time_to_ack`, `oms.order.oms_processing_time`, `oms.order.market_round_trip`,
`oms.order.time_to_market`, tagged with leg and venue. Checkpoints are write-once; negative
durations are dropped; a missing start checkpoint records no latency.

Capability: [order-sla-monitoring](../capabilities/order-sla-monitoring.md).
