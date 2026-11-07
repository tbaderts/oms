---
id: SPEC-0045
title: Rename order_execution_view to order_execution_projection
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

# SPEC-0045 — Rename order_execution_view to order_execution_projection

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Decided in the review discussion of 2026-11-07 (oms-core/docs/event-sourcing-cqrs-review-2026-11-07.md, section 5; target architecture oms-core/docs/target-architecture.md, section 4.2): the order-execution read model is a table, not a SQL view, and its name should say so. Rename the table order_execution_view to order_execution_projection in a new Liquibase changeset that also renames its sequence, primary key, unique constraint and indexes to match the table, with a rollback; decouple the projection name from the table name by adding table() to the Projection interface, so the rebuild selector becomes POST /actuator/projections/order_execution/rebuild and the lock and clear use table(); rename the JPA entity to OrderExecutionProjectionRow and the repository and query service to match, leaving the query contract (ExecutionViewDto, getExecutions) unchanged under P-04; update projections.md, the domain and interface pages and the active spec tickets that name the table. Record the naming rule for future projections: table <subject>_projection, projection name <subject>.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture. Independent; do before or together with SPEC-0044.
