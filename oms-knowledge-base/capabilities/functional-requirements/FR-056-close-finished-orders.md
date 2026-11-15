---
type: Requirement
title: "Close finished orders at end of day"
description: "At end of day every order that can do nothing more (filled, cancelled, rejected, expired) is closed, so only working orders remain open."
tags: [functional]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-056"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-expiry-and-close.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/endofday/EndOfDayService.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EndOfDayIntegrationTest.java"
---
# FR-056 Close finished orders at end of day

At end of day every order that can do nothing more (filled, cancelled, rejected, expired) is closed, so only working orders remain open.

The end-of-day job sends `OrderCloseCmd` through the command dispatcher on one leader instance (SPEC-0029, SPEC-0048).

Capability: [order-expiry-and-close](../order-expiry-and-close.md).
