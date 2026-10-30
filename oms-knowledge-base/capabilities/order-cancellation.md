---
type: Capability
title: "Order Cancellation"
description: "Client cancel requests and the market's cancel confirmations and refusals."
tags: [cancel, order-lifecycle, orders]
status: draft
maturity: "implemented"
commands: ["OrderCancelRequestCmd", "OrderCancelCmd", "OrderCancelRejectCmd"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/LifecycleAction.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ApplyLifecycleActionTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/DeduplicateCommandTask.java"
---
# Order Cancellation

## Summary

A client can ask to cancel the open quantity of a working order; the market confirms
(cancel) or refuses (cancel reject). The OMS tracks this in `cancelState`.

## Actors

Clients (cancel request); the market (cancel, cancel reject).

## Behaviour

`OrderLifecycleCommandProcessor` handles all four lifecycle commands with one pipeline:
`LoadOrderTask` → `DeduplicateCommandTask` → `ValidateLifecycleActionTask` →
`ApplyLifecycleActionTask` → `SaveOrderTask` → `PublishOrderEventTask` (records the event and stages
publication). `LifecycleAction` is the rule table (target state,
cancel state, event, whether open quantity closes, effect on `rejectReason`). Concurrent updates fail
with an optimistic-lock conflict (409).

## Requirements

- [FR-007 Accept cancel requests](../functional-requirements/FR-007-request-cancel.md)
- [FR-008 Apply market cancels](../functional-requirements/FR-008-confirm-cancel.md)
- [FR-009 Apply cancel rejects](../functional-requirements/FR-009-reject-cancel-request.md)
- [FR-010 Ignore redelivered lifecycle commands](../functional-requirements/FR-010-deduplicate-lifecycle-commands.md)
- [NFR-001 Idempotent command handling](../non-functional-requirements/NFR-001-idempotent-command-handling.md)
- [NFR-002 Optimistic concurrency](../non-functional-requirements/NFR-002-optimistic-concurrency.md)

## Interfaces and domain

[Command API](../interfaces/command-api.md), [Kafka Topics](../interfaces/kafka-topics.md); [Order State](../domain/order-state.md).

## Detailed specifications

- [Order Lifecycle Management Specification](../oms-concepts/order-lifecycle.md)
- [Replace, Cancel and Reject Operations](../oms-concepts/order-replace.md) (cancel sections; the replace parts are not built)

## Known gaps

- Cancel of the client order on behalf of a client order tree (parent/child propagation) described in the specs is not built.

## Verification

`OrderLifecycleCommandProcessorTest`, `ExchangeWorkflowIntegrationTest`, `CommandControllerWebMvcTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
