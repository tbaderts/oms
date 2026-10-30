---
type: Capability
title: "Order Rejection"
description: "The market refusing an order, and what the OMS records about the refusal."
tags: [reject, order-lifecycle, orders]
status: draft
maturity: "implemented"
commands: ["OrderRejectCmd"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/LifecycleAction.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ApplyLifecycleActionTask.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/005-order-reject-reason.yaml"
---
# Order Rejection

## Summary

When a venue refuses an order, the OMS moves it to REJ, closes its open quantity and keeps the venue's reason.

## Actors

The market (today the [exchange simulator](exchange-simulation.md)).

## Behaviour

Handled by the shared lifecycle pipeline (see [Order Cancellation](order-cancellation.md)) with action `REJECT`.

## Requirements

- [FR-011 Apply market rejects](../functional-requirements/FR-011-reject-orders.md)
- [FR-012 Expose the reject reason](../functional-requirements/FR-012-expose-reject-reason.md)
- [NFR-001 Idempotent command handling](../non-functional-requirements/NFR-001-idempotent-command-handling.md)

## Interfaces and domain

[Command API](../interfaces/command-api.md), [Kafka Topics](../interfaces/kafka-topics.md); [Order](../domain/order.md).

## Detailed specifications

- [Order Lifecycle Management Specification](../oms-concepts/order-lifecycle.md)
- [Replace, Cancel and Reject Operations](../oms-concepts/order-replace.md) (reject sections)

## Known gaps

None known.

## Verification

`OrderLifecycleCommandProcessorTest`, `ExchangeWorkflowIntegrationTest`, `MetamodelServiceTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
