---
type: Requirement
title: "Refuse invalid acknowledgements"
description: "An OrderAcceptCmd for an unknown order or an order that cannot move to LIVE is refused and records no event."
tags: [functional, order-acceptance]
status: draft
id: "FR-006"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-acceptance.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/OrderAcceptCommandProcessor.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/command/OrderAcceptCommandProcessorTest.java"
---
# Refuse invalid acknowledgements

A missing order or an invalid transition (e.g. an order already LIVE or terminal) returns a
failure (400 on the API) and leaves the order and its event log unchanged.

Capability: [order-acceptance](../capabilities/order-acceptance.md).
