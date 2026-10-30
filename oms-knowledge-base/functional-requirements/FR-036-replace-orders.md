---
type: Requirement
title: "Replace (amend) orders"
description: "A client can change the quantity or price of a working order; the change is confirmed or refused by the market."
tags: [functional, order-replace]
status: draft
id: "FR-036"
priority: "should"
implementation: "not-implemented"
capability: "/capabilities/order-replace.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "/oms-concepts/order-replace.md"
  - resource: "repo:oms-contracts/src/main/avro/CancelState.avsc"
---
# Replace (amend) orders

Specified in [Replace, Cancel and Reject Operations](../oms-concepts/order-replace.md). No replace command exists in the contracts; `CancelState.PMOD` is reserved for it.

Capability: [order-replace](../capabilities/order-replace.md).
