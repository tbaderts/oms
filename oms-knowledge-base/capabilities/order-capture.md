---
type: Capability
title: "Order Capture"
description: "Taking a new client order into the OMS: validation, identity, initial state, persistence and the first event."
tags: [order-capture, orders, commands]
status: draft
updated: "2026-11-14T12:00:00Z"
maturity: "implemented"
commands: ["OrderCreateCmd"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/OrderCreateCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/CommandController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/CommandListener.java"
---
# Order Capture

## Summary

The OMS takes responsibility for a client order when it accepts an `OrderCreateCmd`. The order is
validated, given an OMS `orderId`, put in state UNACK (waiting for the market) and recorded.

## Actors

Client systems and traders (via the [Command API](../domain/interfaces/command-api.md) or the `commands` topic).

## Behaviour

`OrderCreateCommandProcessor` runs a task pipeline:
`ValidateOrderTask` → `AssignOrderIdTask` → `SetOrderStateTask` (NEW → UNACK, quantities, SLA
checkpoints) → `PersistOrderTask` → `PublishOrderEventTask`. Any failure rolls the whole command
back. See [Task Orchestration Framework](../framework/task-orchestrator.md) and
[its diagrams](../architecture/illustrations/task-orchestration-diagrams.md).

## Use cases

- [UC-001 Submit a new order](use-cases/UC-001-submit-order.md)

## Requirements

- [FR-001 Accept new orders](functional-requirements/FR-001-accept-new-orders.md)
- [FR-002 Validate new orders](functional-requirements/FR-002-validate-new-orders.md)
- [FR-003 Record order creation as an event](functional-requirements/FR-003-record-order-creation.md)
- [FR-004 Reject duplicate client order ids](functional-requirements/FR-004-reject-duplicate-client-order-id.md)
- [NFR-001 Idempotent command handling](non-functional-requirements/NFR-001-idempotent-command-handling.md)
- [FR-050 Refuse commands sent against a stale version](functional-requirements/FR-050-refuse-stale-version-commands.md)

## Interfaces and domain

[Command API](../domain/interfaces/command-api.md), [Kafka Topics](../domain/interfaces/message-api.md); [Order](../domain/model/order.md), [Order State](../domain/model/order-state.md).

## Detailed specifications

- [Order Lifecycle Management Specification](../domain/concepts/order-lifecycle.md)
- [Domain Model Organization](../domain/model/domain-model.md)
- [Validation Rules Framework](../framework/validation-engine.md)
- [OpenAPI Contracts and Code Generation](../architecture/patterns/contract-first-codegen.md)
- [Error Handling](../framework/exception-handling.md)

## Known gaps

- `ValidateOrderTaskTest` covers only the sessionId rule; the other validation rules are untested (FR-002 is `partial`).
- The predicate-based validation framework described in [Validation Rules](../framework/validation-engine.md)
  is not what `ValidateOrderTask` uses; it checks fields directly.
- Differences from [Order Lifecycle](../domain/concepts/order-lifecycle.md), which reads as current behaviour:
  - §4.2 "NEW → REJ (Validation Failed)": an invalid order is not persisted in state REJ; the command
    fails with 400 and nothing is stored.
  - §4.3 "NEW → CXL (Cancel Before Send)": not possible; the standard state machine has no NEW → CXL
    and a cancel request requires a LIVE order.

## Verification

`CommandControllerWebMvcTest`, `CommandListenerTest`, `ValidateOrderTaskTest`, `SetOrderStateTaskTest`, `PersistOrderTaskTest`, `PublishOrderEventTaskTest`. Conventions: [Testing Patterns](../delivery/testing.md).
