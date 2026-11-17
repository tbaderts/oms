---
id: SPEC-0052
title: Partition the event log and archive closed orders
type: feature
status: blocked
awaiting:
autopilot: true
modules: [oms-core, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-07
blocked_from: implement
blocked_reason: T-1..T-12 done and their tests pass; only T-13 (spec verify) remains. It needs a quiet window: the peer session oms-bb has uncommitted work in oms-core/oms-contracts (query API: ExecutionViewController, OrderExecutionProjectionQueryService, new ExecutionOrder, oms-query-api.yml) and runs oms-core tests in the same build directory. spec verify runs ./gradlew check and the policy check over all changes since main, so it would mix that work in, and concurrent Gradle runs already killed one of my test runs. Unblock once oms-bb's change is committed or paused, and I will run spec verify, the independent review and verification.md.
---

# SPEC-0052 — Partition the event log and archive closed orders

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Ticket G of the event sourcing and CQRS review (finding F-17; target architecture section 4.4): order_events, executions, command_log and the projection tables do not grow without bound. Partition order_events by month on time_stamp with native declarative partitioning in a new changeset, deciding in the design how the unique (order_id, version) and (order_id, command_id) constraints are kept; archive the events, executions, command-log rows and projection rows of orders that have been CLOSED for longer than a configurable retention period to cold storage, driven by the CLOSE event, and detach partitions that hold nothing else; measure with the SPEC-0024 load suite that a year of simulated volume stays within the agreed storage and vacuum budget; document the retention policy and that post-trade analytics keeps its own history.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture. Depends on SPEC-0047 and the measurements of SPEC-0024.
- 2026-11-08 22:03 — autopilot on
- 2026-11-08 22:05 — blocked: Proposal drafted; three decisions needed (proposal.md, Open Questions). 1) System of record after archiving: the KB (post-trade-analytics.md §9) names order_events as the regulatory full history (MiFIR Art. 25, years) and the rebuild source; archiving moves it out. Is cold storage the system of record for archived orders (recommended), or must post-trade analytics hold it first? 2) Cold storage target: (a) one checksummed, compressed JSON document per order in a directory / immutable object store (recommended) or (b) a separate PostgreSQL archive database/schema. 3) AC-8 numbers: daily order volume (and fills per order) to project, the storage budget for the hot tables, and the autovacuum budget. Unblock with a note naming the choices and numbers.
- 2026-11-16 16:41 — Decisions (Toni, 2026-11-16, in chat): experimentation stack, compliance is not a driver; the aim is to validate architecture concepts. (1) System of record: post-trade analytics must hold an order's history before it is archived (archive only after analytics confirms). (2) Archive target: a PostgreSQL LOGICAL replica of the OMS database that does not replicate deletes (publication without delete), so archived orders remain there; the same replica serves CQRS read segregation (SPEC-0021). Archiving = verify the replica and analytics hold the order, then delete it from the primary's hot tables. (3) AC-8 budgets: the agent proposes numbers from the SPEC-0024 load-suite shape as assumptions, for approval at the proposal gate.
- 2026-11-16 16:41 — Refinement of decision (1) (Toni, 2026-11-16): post-trade analytics is only planned, so the 'analytics holds it first' rule becomes a pluggable archiving precondition that is DISABLED until analytics exists. Until then an order is archived once the logical replica is verified to hold its full history; enabling the analytics check later needs no archiver change.
- 2026-11-16 16:44 — unblocked → proposal
- 2026-11-16 16:45 — autopilot on
- 2026-11-16 16:46 — proposal gate passed; awaiting human approval
- 2026-11-17 05:02 — proposal approved by Toni Badertscher
- 2026-11-17 05:02 — proposal → design
- 2026-11-17 05:06 — design → plan
- 2026-11-17 05:07 — plan → implement
- 2026-11-17 06:40 — blocked: T-1..T-12 done and their tests pass; only T-13 (spec verify) remains. It needs a quiet window: the peer session oms-bb has uncommitted work in oms-core/oms-contracts (query API: ExecutionViewController, OrderExecutionProjectionQueryService, new ExecutionOrder, oms-query-api.yml) and runs oms-core tests in the same build directory. spec verify runs ./gradlew check and the policy check over all changes since main, so it would mix that work in, and concurrent Gradle runs already killed one of my test runs. Unblock once oms-bb's change is committed or paused, and I will run spec verify, the independent review and verification.md.
