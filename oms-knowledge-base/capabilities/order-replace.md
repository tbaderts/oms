---
type: Capability
title: "Order Replace"
description: "Amending a working order's quantity or price (FIX OrderCancelReplaceRequest); specified, not built."
tags: [replace, amend, order-lifecycle]
status: draft
maturity: "planned"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "/oms-concepts/order-replace.md"
---
# Order Replace

## Summary

Clients will be able to amend working orders. Nothing of this is built: there is no replace command, processor or API.

## Behaviour

As proposed in the specification: a replace request sets cancelState PMOD; the market confirms (new quantity/price) or refuses.

## Requirements

- [FR-036 Replace (amend) orders](../functional-requirements/FR-036-replace-orders.md)

## Detailed specifications

- [Replace, Cancel and Reject Operations](../oms-concepts/order-replace.md) — its front matter says `stable` and its old header "Active", but the replace part describes behaviour that does not exist.

## Known gaps

- The specification reads as current behaviour; treat its replace sections as a design for this planned capability.
