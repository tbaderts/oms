---
type: Capability
title: "Order SLA Monitoring"
description: "Timestamping order checkpoints and exposing latency metrics for service-level monitoring."
tags: [sla, latency, metrics]
status: draft
maturity: "implemented"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-02T16:40:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/sla/OrderSlaRecorder.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/metrics/OrderFlowMetrics.java"
  - resource: "repo:oms-core/grafana/dashboards/oms-overview.json"
  - resource: "repo:oms-core/grafana/dashboards/oms-services.json"
---
# Order SLA Monitoring

## Summary

The OMS measures how long it takes to acknowledge and route each order, split into its own processing and the broker round trip.

## Actors

Operations (Prometheus / Grafana).

## Behaviour

Checkpoints follow the FIX TrdRegTimestamps model (770=2 TimeIn, 770=3 TimeOut, 770=4 BrokerReceipt).

## Metrics and dashboards

oms-core pushes its metrics over OTLP to Mimir (SPEC-0033). Names in Mimir drop the dots, with no
`_total` suffix; timers and distributions arrive as `_bucket`/`_count`/`_sum`/`_max`, timers in
milliseconds.

| Meter | In Mimir | What it shows |
|---|---|---|
| `oms.order.time_to_ack`, `oms_processing_time`, `market_round_trip`, `time_to_market` | `oms_order_<name>_bucket` | SLA latencies (above) |
| `oms.order.events{event}` | `oms_order_events` | Order events appended to `order_events`, one per event type (`NEW_ORDER`, `ACK`, `PARTIAL_FILL`, `FILL`, `CXL_REQUEST`, `CXL`, `CXL_REJ`, `REJ`, `EXP`, `CLOSE`), counted after the transaction commits; a refused or rolled-back command counts nothing (SPEC-0038) |
| `oms.orders.by_state{state}` | `oms_orders_by_state` | Orders currently in each state, read from `orders` when collected (SPEC-0038) |
| `oms.executions.quantity{side}` | `oms_executions_quantity_count` / `_sum` | Fills and filled quantity by side, after commit; a duplicate fill records nothing (SPEC-0038) |
| `oms.commands.consumed{type,outcome}` | `oms_commands_consumed` | Kafka commands applied, refused or failed |
| `oms.outbox.pending`, `stuck`, `oldest.age` | `oms_outbox_*` | Outbox backlog |
| `oms.end-of-day.orders{step}`, `failures{step}` | `oms_end_of_day_*` | End-of-day expiries and closes; present at 0 from startup |

Every series carries `service_name`. The order-flow series exist at 0 from startup.

Grafana provisions two dashboards from `oms-core/grafana/dashboards` into the **OMS** folder
(read-only in the UI; change the JSON in the repository):
- **OMS Overview** (`oms-overview`): order events, orders by state, fills and filled quantity,
  commands consumed, SLA p99, outbox, end of day, oms-core warnings and errors;
- **OMS Services** (`oms-services`), per `service_name`: HTTP rate, errors and p95, JVM memory,
  CPU, threads, Kafka records and lag, warnings and errors, recent traces.

## Requirements

- [FR-030 Measure order latency at SLA checkpoints](../functional-requirements/FR-030-measure-order-latency.md)
- [NFR-006 Order latency measurement](../non-functional-requirements/NFR-006-order-latency-measurement.md)

## Interfaces and domain

[Order](../domain/order.md) (checkpoint fields).

## Known gaps

- `SetOrderStateTask` and `OrderSlaRecorder` link to an SLA Measurement page
  (`oms-concepts/sla-measurement.md`) that does not exist; this capability is the closest description.
- No latency targets or alerts are defined; dashboards exist, alert rules do not.
- `leg` is not populated yet, so client and market orders are not separated in practice.

## Verification

`OrderSlaRecorderTest`, `OrderLifecycleCommandProcessorTest` (accept cases), `OrderFlowMetricsTest`,
`OrderFlowMetricsIntegrationTest`, `EndOfDayMetricsTest`, `GrafanaDashboardsTest`, and the
S38 checks of `oms-core/scripts/lgtm-smoke-test.ps1` (every dashboard query returns data). Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
