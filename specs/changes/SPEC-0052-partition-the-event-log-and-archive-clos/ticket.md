---
id: SPEC-0052
title: Partition the event log and archive closed orders
type: feature
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
- 2026-11-17 10:46 — unblocked → implement
- 2026-11-17 10:47 — verify run: pass
- 2026-11-17 10:55 — verify run: fail
- 2026-11-17 11:06 — verify run: pass
- 2026-11-17 11:06 — implement → verify
- 2026-11-17 11:12 — reopened at design: Independent review: the replica keeps natural-key unique constraints while deletes are not replicated, so clOrdId reuse after archiving and a projection rebuild (delete-all + re-insert) halt replication; retention batches can be starved by orders that keep failing; AC-10 figures unrecorded and projection reports unmeasured values as within budget. Fix: replica-only changeset dropping uq_orders_session_cl_ord_id, rebuild upserts in place, failure-aware batch ordering, lock_timeout on DETACH, honest AC-10 reporting.
- 2026-11-17 11:13 — design → plan
- 2026-11-17 11:14 — plan → implement
- 2026-11-17 11:47 — verify run: fail
- 2026-11-17 12:10 — verify run: pass
- 2026-11-17 12:10 — implement → verify
- 2026-11-17 12:15 — reopened at implement: Second review: AC-10 storage/WAL measured before CLOSE (baseline shape includes close); plus minors: catch-all in RetentionJob.archive, precondition keeping 018 off the publisher, tests for retainOnly stale-row delete and detach lock timeout, KB note on failure-memory limits.
- 2026-11-17 12:46 — verify run: pass
- 2026-11-17 12:47 — implement → verify
- 2026-11-17 12:51 — reopened at implement: Third review: AC-10 density not an upper bound (7,505 unclosed FILLED orders held); re-measure on a clean history; minors: WAL unmeasured printed as 0, lock-row race maps to error not changed, blocked-drop test needs two partitions, replica size not recorded.
- 2026-11-17 13:20 — blocked: AC-10 storage over budget; a requester decision is needed. On a clean history (all leftover orders archived, tables compacted, 5,000 orders measured create-to-CLOSED), a CLOSED order takes 14.3-14.4 KB, so 20,000 orders/day x 90 days = 25.7 GB of hot storage against the proposed 25 GB: 3% over. Fully compacted it is 13.4 KB (24.1 GB), a floor real tables don't reach. Two-thirds is order_events (four events, each with a full order snapshot). Vacuum passes: 0.6 s/day vs 600 s. Everything else passes (ACs 1-9, 11), after three independent reviews and their fixes. verification.md has the figures; verdict GOAL NOT MET. Options: (A, recommended) raise the hot-storage budget to 30 GB (measured 25.7 GB + about 15% headroom) and open a follow-up ticket to shrink event snapshots; (B) shorten the default retention to 80 days (1.6 M orders, about 23 GB); (C) shrink events in this ticket (e.g. compress or slim the order snapshot), which widens scope. Unblock with a note naming the choice; A or B changes proposal.md's assumption, so the proposal goes back for approval.
- 2026-11-17 14:09 — Decision (Toni, 2026-11-17, in chat): shrink the retention period to 30 days; it is ok for this setup. Budgets unchanged (25 GB hot storage, 10 min vacuum a day).
- 2026-11-17 14:09 — unblocked → implement
- 2026-11-17 14:09 — reopened at proposal: Requester decision 2026-11-17: retention period 90 -> 30 days (AC-10 storage at 90 days measured 25.7 GB > 25 GB budget). Budgets unchanged.
- 2026-11-17 14:10 — proposal gate passed; awaiting human approval
- 2026-11-17 14:33 — proposal approved by Toni Badertscher
- 2026-11-17 14:33 — proposal → design
- 2026-11-17 14:33 — design → plan
- 2026-11-17 14:33 — plan → implement
- 2026-11-17 14:59 — verify run: pass
- 2026-11-17 14:59 — implement → verify
- 2026-11-17 15:40 — verify → done
- 2026-11-17 15:40 — autopilot off
