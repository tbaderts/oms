---
id: SPEC-0047
title: Cut fill write set with pointer outbox rows
type: refactor
status: blocked
awaiting:
autopilot: true
modules: [oms-core, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-11-07
blocked_from: proposal
blocked_reason: Proposal drafted; two decisions needed (proposal.md, Open Questions). 1) The goal requires proof with the SPEC-0024 harness, which is still at proposal and unbuilt: (a) wait for SPEC-0024, (b) replace the load proof with in-repo measurements (statement and sequence round-trip counts, outbox bytes vs a recorded baseline, AC-6/AC-7), or (c) do (b) now and keep the load comparison (AC-8) as a later check. 2) 'Per-key order unchanged with several instances' cannot be tested before SPEC-0048 adds multi-instance relay safety, and SPEC-0048 depends on this ticket: is the single-instance version-ordering test (AC-5) enough here, with the several-instance check moved to SPEC-0048? Unblock with a note naming the choices.
---

# SPEC-0047 — Cut fill write set with pointer outbox rows

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Ticket C of the event sourcing and CQRS review (findings F-3 and F-4; target architecture sections 4.2 and 6.1): the fill transaction serialises the order snapshot once instead of three times and makes few sequence round trips. Make ORDER and EXECUTION outbox rows pointers (order_id, aggregate_version, exec id where relevant, root_order_id) and let MessagePublisher read the snapshot from order_events by (order_id, version) at publish time, keeping PROJECTION rows self-contained; store root_order_id on executions so the EXECUTION row no longer carries the whole order; pool the sequences of orders, executions, order_events and the projection table (allocationSize 50, pooled-lo) and enable JDBC batching, keeping outbox ordering correct by ordering each aggregate's rows by aggregate_version then id in the relay; prove with the SPEC-0024 harness that fill latency and write volume improved against the baseline and that per-key publication order is unchanged with several instances.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture. Depends on SPEC-0024 for the baseline. SPEC-0048 and SPEC-0052 depend on it.
- 2026-11-08 05:24 — autopilot on
- 2026-11-08 05:25 — blocked: Proposal drafted; two decisions needed (proposal.md, Open Questions). 1) The goal requires proof with the SPEC-0024 harness, which is still at proposal and unbuilt: (a) wait for SPEC-0024, (b) replace the load proof with in-repo measurements (statement and sequence round-trip counts, outbox bytes vs a recorded baseline, AC-6/AC-7), or (c) do (b) now and keep the load comparison (AC-8) as a later check. 2) 'Per-key order unchanged with several instances' cannot be tested before SPEC-0048 adds multi-instance relay safety, and SPEC-0048 depends on this ticket: is the single-instance version-ordering test (AC-5) enough here, with the several-instance check moved to SPEC-0048? Unblock with a note naming the choices.
