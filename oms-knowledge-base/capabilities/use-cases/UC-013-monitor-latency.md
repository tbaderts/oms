---
type: Use Case
title: "Monitor order latency and processing"
description: "Operations watches how fast and how healthily orders are processed."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-013"
actors: [/capabilities/actors/operations-user.md]
capability: "/capabilities/order-sla-monitoring.md"
---
# UC-013 Monitor order latency and processing

Operations watches how fast and how healthily orders are processed.

Capability: [order-sla-monitoring](../order-sla-monitoring.md). Actors: [Operations User](../actors/operations-user.md).

## Preconditions

- Telemetry export is on.

## Main Flow

1. The OMS timestamps checkpoints on every order and records latency histograms.
2. Services push metrics, traces and logs to Alloy.
3. Operations watches the OMS dashboards in Grafana (latency p99, order events, outbox health).

## Alternative Flows

- Telemetry is off (host-native default): nothing is exported.

## Postconditions

- Operations knows the latency and health of the flow.

## Requirements

- [FR-030](../functional-requirements/FR-030-measure-order-latency.md)
- [NFR-006](../non-functional-requirements/NFR-006-order-latency-measurement.md)
- [NFR-007](../non-functional-requirements/NFR-007-observability.md)
