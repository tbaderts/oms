---
type: Capability
title: "Order SLA Monitoring"
description: "Timestamping order checkpoints and exposing latency metrics for service-level monitoring."
tags: [sla, latency, metrics]
status: draft
maturity: "implemented"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/sla/OrderSlaRecorder.java"
---
# Order SLA Monitoring

## Summary

The OMS measures how long it takes to acknowledge and route each order, split into its own processing and the broker round trip.

## Actors

Operations (Prometheus / Grafana).

## Behaviour

Checkpoints follow the FIX TrdRegTimestamps model (770=2 TimeIn, 770=3 TimeOut, 770=4 BrokerReceipt).

## Requirements

- [FR-030 Measure order latency at SLA checkpoints](../functional-requirements/FR-030-measure-order-latency.md)
- [NFR-006 Order latency measurement](../non-functional-requirements/NFR-006-order-latency-measurement.md)

## Interfaces and domain

[Order](../domain/order.md) (checkpoint fields).

## Known gaps

- `SetOrderStateTask` and `OrderSlaRecorder` link to an SLA Measurement page
  (`oms-concepts/sla-measurement.md`) that does not exist; this capability is the closest description.
- No latency targets or alerts are defined.
- `leg` is not populated yet, so client and market orders are not separated in practice.

## Verification

`OrderSlaRecorderTest`, `OrderAcceptCommandProcessorTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
