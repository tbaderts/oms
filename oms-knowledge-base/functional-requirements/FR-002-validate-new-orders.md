---
type: Requirement
title: "Validate new orders"
description: "A new order missing a required field, with a non-positive quantity, a limit order without price or a stop order without stop price is refused."
tags: [functional, order-capture]
status: draft
id: "FR-002"
priority: "must"
implementation: "partial"
capability: "/capabilities/order-capture.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-31T07:10:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/ValidateOrderTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/GlobalExceptionHandler.java"
  - resource: "repo:oms-contracts/src/main/openapi/oms-cmd-api.yml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/command/tasks/ValidateOrderTaskTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/api/CommandModelValidationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/api/CommandControllerWebMvcTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderLifecycleIntegrationTest.java"
---
# Validate new orders

A new order is refused, writing nothing, when a required field (symbol, side, orderQty, ordType,
account, sessionId, clOrdId) is missing or blank, `orderQty` is not positive, a LIMIT order has no
price, or a STOP / STOP_LIMIT order has no stop price.

The required fields are part of the command contract (`oms-cmd-api.yml` 2.0.0, `Order.required`;
`sessionId` and `clOrdId` must also be non-empty). The two command paths check them differently:

- **HTTP** (`POST /api/command/execute`): request validation rejects a body that breaks the
  contract before any processing. The answer is 400 with the `validation-failed` problem from
  [error handling](../oms-framework/error-handling.md), listing each failing field by path, e.g.
  `errors: {"order.sessionId": ["must not be null"]}`.
- **Kafka** (commands topic): the Avro schema keeps these fields nullable, so
  `ValidateOrderTask`, which runs first in the creation pipeline, refuses the order. The rejection
  is logged and acknowledged.

The business rules that the contract cannot express (blank values, positive quantity, price for
LIMIT, stop price for STOP) are checked by `ValidateOrderTask` on both paths. Its failures answer
400 with a `CommandResult` of status `FAILED` and the reason.

**Partial**: the rules are built. Automated tests cover the sessionId rule on both paths
(`ValidateOrderTaskTest`, `CommandModelValidationTest`, `CommandControllerWebMvcTest`,
`OrderLifecycleIntegrationTest`, SPEC-0034). The other rules have no dedicated test.

Capability: [order-capture](../capabilities/order-capture.md).
