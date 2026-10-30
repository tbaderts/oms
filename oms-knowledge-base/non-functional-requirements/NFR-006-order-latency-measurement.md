---
type: Requirement
title: "Order latency is measured"
description: "Time to acknowledge, OMS processing time and market round trip are measured for every order."
tags: [non-functional, performance]
status: draft
id: "NFR-006"
priority: "should"
implementation: "partial"
capability: "/capabilities/order-sla-monitoring.md"
category: "performance"
metric: "Timers oms.order.time_to_ack, oms.order.oms_processing_time, oms.order.market_round_trip, oms.order.time_to_market"
target: "Measured for every order; numeric targets not yet agreed"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/sla/OrderSlaRecorder.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/sla/OrderSlaRecorderTest.java"
---
# Order latency is measured

| Category | Metric | Target |
|---|---|---|
| performance | Timers oms.order.time_to_ack, oms.order.oms_processing_time, oms.order.market_round_trip, oms.order.time_to_market | Measured for every order; numeric targets not yet agreed |

Partial: measurement is built ([FR-030](../functional-requirements/FR-030-measure-order-latency.md)); targets and alerting are not.

Capability: [order-sla-monitoring](../capabilities/order-sla-monitoring.md).
