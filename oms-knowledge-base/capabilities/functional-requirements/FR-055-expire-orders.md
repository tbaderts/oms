---
type: Requirement
title: "Expire orders when their time in force runs out"
description: "A working order whose time in force has run out (DAY at end of day, GTD at its expire time, or an explicit expire command) moves to EXP and its open quantity is closed."
tags: [functional]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-055"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-expiry-and-close.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/endofday/OrderExpiryService.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderExpiryCloseIntegrationTest.java"
---
# FR-055 Expire orders when their time in force runs out

A working order whose time in force has run out (DAY at end of day, GTD at its expire time, or an explicit expire command) moves to EXP and its open quantity is closed.

Expiry goes through `OrderExpireCmd`, from the scheduler or a client, so it is logged and published like any other change (SPEC-0029).

Capability: [order-expiry-and-close](../order-expiry-and-close.md).
