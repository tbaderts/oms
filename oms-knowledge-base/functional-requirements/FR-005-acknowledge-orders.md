---
type: Requirement
title: "Move acknowledged orders to LIVE"
description: "An OrderAcceptCmd for an UNACK order moves it to LIVE, records an ACK event, stamps the market-ack time and stages the order for publication."
tags: [functional, order-acceptance]
status: draft
id: "FR-005"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-acceptance.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/OrderAcceptCommandProcessor.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/command/OrderAcceptCommandProcessorTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/CommandListenerKafkaIntegrationTest.java"
---
# Move acknowledged orders to LIVE

On market acknowledgement the order moves UNACK → LIVE (validated by the state machine), is
persisted, and `OrderEventAppender` records `ACK` and stages the updated order on `oms_orders`.
The SLA recorder stamps `marketAckTime` with the observed ingress time.

Capability: [order-acceptance](../capabilities/order-acceptance.md).
