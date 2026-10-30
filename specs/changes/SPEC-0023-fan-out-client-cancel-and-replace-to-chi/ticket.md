---
id: SPEC-0023
title: Fan out client cancel and replace to children
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

# SPEC-0023 — Fan out client cancel and replace to children

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Roadmap ticket F of the architecture review (oms-core/docs/architecture-review-2026-10-30.md, section 6, trees phase 2): a client cancel request sets the client order and every child with open quantity to PCXL in one transaction and stages one venue cancel request per child; each venue answer ripples up and the client order resolves when the last child has answered, with partial outcomes (some children cancelled, one rejected) kept as a first-class state; add OrderReplaceRequestCmd with PMOD and pending values following the same shape, where a quantity decrease within the unplaced quantity completes without a venue round trip.

## Log

- 2026-10-30 created
