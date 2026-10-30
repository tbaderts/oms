---
type: Requirement
title: "Reject duplicate client order ids"
description: "A second order with the same clOrdId in the same session is refused and the first order is unchanged."
tags: [functional, order-capture]
status: draft
id: "FR-004"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-capture.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/PersistOrderTask.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/002-order-idempotency-constraint.yaml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/command/tasks/PersistOrderTaskTest.java"
---
# Reject duplicate client order ids

`(sessionId, clOrdId)` identifies a client order. `PersistOrderTask` refuses a duplicate, and the
unique constraint `uq_orders_session_cl_ord_id` guarantees it under concurrency. This makes order
creation idempotent for clients that resend.

Capability: [order-capture](../capabilities/order-capture.md).
