---
id: SPEC-0022
title: Model market order legs with upward rippling
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0022 — Model market order legs with upward rippling

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Roadmap ticket E of the architecture review (oms-core/docs/architecture-review-2026-10-30.md, section 6, trees phase 1): populate leg, parentOrderId and rootOrderId; add an OrderPlaceCmd that creates a MKT child order for at most the unplaced quantity of a CLI client order; lock the root row first in every command that touches a tree member; ripple placement, fills, venue rejects and cancels from the market order to the client order inside the transaction of the market order, maintaining placeQty, cumQty and leavesQty as the quantity-calculation paper defines; record root_order_id, caused_by_order_id, caused_by_version and correlation_id on order_events; add leg to OrderMessage.avsc; make the exchange simulator act only on orders with leg MKT.

## Log

- 2026-10-30 created
