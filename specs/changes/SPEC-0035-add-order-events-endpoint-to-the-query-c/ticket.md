---
id: SPEC-0035
title: Add order-events endpoint to the query contract
type: fix
status: proposal
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, developer-cockpit]
approvals: []
owner: Toni Badertscher
created: 2026-10-31
blocked_from:
blocked_reason:
---

# SPEC-0035 — Add order-events endpoint to the query contract

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Contract the order-events endpoint: /api/order-events/orderId/{orderId} is @Hidden and not in oms-query-api.yml; add it as a query operation, as agreed in the SPEC-0007 proposal, and plan a fix for anything that breaks.

## Log

- 2026-10-31 created
