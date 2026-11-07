---
id: SPEC-0051
title: Add projection tiers, republish and position projection
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-core, oms-contracts, oms-streaming-service, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-11-07
blocked_from:
blocked_reason:
---

# SPEC-0051 — Add projection tiers, republish and position projection

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Ticket F of the event sourcing and CQRS review (findings F-9 and F-15; target architecture section 7): projections come in two named tiers and both can be refilled from the log. Document tier 1 (inline, in the command transaction) and tier 2 (asynchronous Kafka consumer groups with the offset as checkpoint, a dead-letter topic per group and a lag metric), and describe the streaming service as the first tier-2 projection with its rebuild story; add POST /actuator/projections/republish that re-stages the events of one order or of every order for a topic into the outbox under the same keys and versions; rebuild tier-1 projections into a shadow table streamed per order from order_events and executions and swap it in by rename so fills are never blocked; add position_projection keyed by (account, symbol, trade_date) with net_qty, notional, fill_count and last_order_version, updated per fill and per bust and rebuildable from executions by order_version, and expose it as GET /api/query/positions in the query contract.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture. Depends on SPEC-0044 and SPEC-0021.
