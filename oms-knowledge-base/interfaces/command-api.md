---
type: Interface
title: "Command API"
description: "POST /api/command/execute: the single HTTP entry point for commands, with its accepted command types and responses."
tags: [api, commands, rest]
status: draft
covers: ["openapi:/execute", "http:/api/command"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/openapi/oms-cmd-api.yml"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/CommandController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/api/CommandControllerWebMvcTest.java"
---
# Command API

Defined in `oms-contracts/src/main/openapi/oms-cmd-api.yml` as `POST /execute`; implemented by
`CommandController` (generated `ExecuteApi`) under `/api/command`, so the URL is
`POST /api/command/execute`. The body is a command with a `type` discriminator.

| Command (`type`) | Effect | Success |
|---|---|---|
| OrderCreateCmd | [Order Capture](../capabilities/order-capture.md) | 201, `CommandResult` with the new orderId |
| OrderAcceptCmd | [Order Acceptance](../capabilities/order-acceptance.md) | 200 |
| ExecutionCreateCmd | [Execution Processing](../capabilities/execution-processing.md) | 201 |
| OrderCancelRequestCmd, OrderCancelCmd, OrderCancelRejectCmd | [Order Cancellation](../capabilities/order-cancellation.md) | 200 |
| OrderRejectCmd | [Order Rejection](../capabilities/order-rejection.md) | 200 |

A command refused by its processor returns 400 with `CommandResult` status `FAILED` and a message.
A body with an unknown `type` cannot be read and is rejected with 400 before the controller.
Exceptions are answered by `GlobalExceptionHandler` as RFC 7807 problem details instead of a
`CommandResult`: `IllegalArgumentException` (e.g. an execution for an unknown order) → 400;
`StateTransitionException`, an optimistic-lock conflict (concurrent update of the same order) or a
database constraint violation → 409; anything unexpected → 500. A known command that no processor
handles (e.g. `ExecutionBustCmd`) returns 501 Not Implemented. The same commands are accepted on the
`commands` Kafka topic (see [Kafka Topics](kafka-topics.md)).

Details: [OpenAPI Contracts](../oms-framework/openapi-contracts.md),
[Error Handling](../oms-framework/error-handling.md).
