---
id: SPEC-0047
title: Cut fill write set with pointer outbox rows
type: refactor
status: proposal
awaiting:
autopilot: false
modules: [oms-core, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-11-07
blocked_from:
blocked_reason:
---

# SPEC-0047 — Cut fill write set with pointer outbox rows

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Ticket C of the event sourcing and CQRS review (findings F-3 and F-4; target architecture sections 4.2 and 6.1): the fill transaction serialises the order snapshot once instead of three times and makes few sequence round trips. Make ORDER and EXECUTION outbox rows pointers (order_id, aggregate_version, exec id where relevant, root_order_id) and let MessagePublisher read the snapshot from order_events by (order_id, version) at publish time, keeping PROJECTION rows self-contained; store root_order_id on executions so the EXECUTION row no longer carries the whole order; pool the sequences of orders, executions, order_events and the projection table (allocationSize 50, pooled-lo) and enable JDBC batching, keeping outbox ordering correct by ordering each aggregate's rows by aggregate_version then id in the relay; prove with the SPEC-0024 harness that fill latency and write volume improved against the baseline and that per-key publication order is unchanged with several instances.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture. Depends on SPEC-0024 for the baseline. SPEC-0048 and SPEC-0052 depend on it.
