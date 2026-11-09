---
id: SPEC-0052
title: Partition the event log and archive closed orders
type: feature
status: blocked
awaiting:
autopilot: true
modules: [oms-core, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-11-07
blocked_from: proposal
blocked_reason: Proposal drafted; three decisions needed (proposal.md, Open Questions). 1) System of record after archiving: the KB (post-trade-analytics.md §9) names order_events as the regulatory full history (MiFIR Art. 25, years) and the rebuild source; archiving moves it out. Is cold storage the system of record for archived orders (recommended), or must post-trade analytics hold it first? 2) Cold storage target: (a) one checksummed, compressed JSON document per order in a directory / immutable object store (recommended) or (b) a separate PostgreSQL archive database/schema. 3) AC-8 numbers: daily order volume (and fills per order) to project, the storage budget for the hot tables, and the autovacuum budget. Unblock with a note naming the choices and numbers.
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
