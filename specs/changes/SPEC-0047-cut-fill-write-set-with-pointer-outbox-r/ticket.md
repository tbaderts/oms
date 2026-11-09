---
id: SPEC-0047
title: Cut fill write set with pointer outbox rows
type: refactor
status: done
awaiting:
autopilot: false
modules: [oms-core, oms-knowledge-base]
approvals: [proposal]
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
- 2026-11-08 05:24 — autopilot on
- 2026-11-08 05:25 — blocked: Proposal drafted; two decisions needed (proposal.md, Open Questions). 1) The goal requires proof with the SPEC-0024 harness, which is still at proposal and unbuilt: (a) wait for SPEC-0024, (b) replace the load proof with in-repo measurements (statement and sequence round-trip counts, outbox bytes vs a recorded baseline, AC-6/AC-7), or (c) do (b) now and keep the load comparison (AC-8) as a later check. 2) 'Per-key order unchanged with several instances' cannot be tested before SPEC-0048 adds multi-instance relay safety, and SPEC-0048 depends on this ticket: is the single-instance version-ordering test (AC-5) enough here, with the several-instance check moved to SPEC-0048? Unblock with a note naming the choices.
- 2026-11-08 11:06 — Decision (Toni Badertscher, in chat): SPEC-0024 is done, so open question 1 resolves to (a): prove the result with the SPEC-0024 replay harness and load suite. SPEC-0048 is also done, so open question 2 resolves to keeping the several-instance per-key ordering check in this ticket, using SPEC-0048's two-instance test support.
- 2026-11-08 11:06 — unblocked → proposal
- 2026-11-08 11:07 — proposal gate passed; awaiting human approval
- 2026-11-08 11:09 — proposal approved by Toni Badertscher
- 2026-11-08 11:09 — proposal → design
- 2026-11-08 11:14 — design → plan
- 2026-11-08 11:14 — plan → implement
- 2026-11-08 11:52 — verify run: fail
- 2026-11-08 11:59 — verify run: fail
- 2026-11-08 12:08 — verify run: fail
- 2026-11-08 12:15 — verify run: pass
- 2026-11-08 12:15 — implement → verify
- 2026-11-08 12:21 — reopened at implement: Independent review: major finding 1 (rolling deploy and rollback with pointer rows not documented); minor findings 2, 3, 6 (AC-2 comparison against the stored snapshot, AC-4 execution branch untested, cleanup race in PointerOutboxIntegrationTest)
- 2026-11-08 12:28 — verify run: pass
- 2026-11-08 12:29 — implement → verify
- 2026-11-08 12:29 — verify → done
- 2026-11-08 12:29 — autopilot off
