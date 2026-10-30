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
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/ValidateOrderTask.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/command/tasks/ValidateOrderTaskTest.java"
---
# Validate new orders

`ValidateOrderTask` runs first in the creation pipeline and refuses the order, writing nothing,
when a required field (symbol, side, orderQty, ordType, account, sessionId, clOrdId) is missing or
blank, `orderQty` is not positive, a LIMIT order has no price, or a STOP / STOP_LIMIT order has no
stop price. The API answers 400 with the reason.

**Partial**: the rules are built, but only the sessionId rule has an automated test
(`ValidateOrderTaskTest`).

Capability: [order-capture](../capabilities/order-capture.md).
