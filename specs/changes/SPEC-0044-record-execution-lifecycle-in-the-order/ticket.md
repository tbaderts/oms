---
id: SPEC-0044
title: Record execution lifecycle in the order event log
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-core, oms-contracts, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-07
blocked_from:
blocked_reason:
---

# SPEC-0044 — Record execution lifecycle in the order event log

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Ticket A of the event sourcing and CQRS review (oms-core/docs/event-sourcing-cqrs-review-2026-11-07.md, section 4.4 and findings F-1 and F-11; target architecture oms-core/docs/target-architecture.md, sections 4 and 5.3): keep one event stream per order and make executions addressable in it. Add an exec_id column to order_events, backfilled from the stored ExecutionCreateCmd of PARTIAL_FILL and FILL events, with an index on (order_id, exec_id); add the event types EXEC_BUST, EXEC_CORRECT and EXEC_WHACK and the FILLED to LIVE transition for a bust that reopens quantity; add status (APPLIED, BUSTED, CORRECTED), order_version, root_order_id, exec_ref_id and busted_at_version to executions, backfilled from the order-execution projection table; set exec_id, order_version and root_order_id in OrderEventAppender.appendExecutionEvent and add appendExecutionLifecycleEvent for bust, correction and whack, which records the event with exec_id, updates the execution status and stages an OrderExecution record with execType H or G on oms_order_executions; make sumNotionalByOrderId count APPLIED fills only; add OrderReplayService.executionsAt(orderId, version); add an execId filter to GET /api/query/orders/{orderId}/events as an additive OpenAPI change; replace the hand-coded CancelState preconditions and the new execution status rules with StateMachineConfig instances consulted by the validate tasks (P-10); delete the rebuilder's position-matching fallback once the backfill has run. SPEC-0030 builds its bust and correction processors on this ticket.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture (oms-core/docs/target-architecture.md). Do SPEC-0045 first or together: the executions backfill reads the projection table. SPEC-0030 depends on this ticket.
- 2026-11-07 17:15 — autopilot on
- 2026-11-07 17:23 — proposal gate passed; awaiting human approval
- 2026-11-07 17:36 — proposal approved by Toni Badertscher
- 2026-11-07 17:36 — proposal → design
- 2026-11-07 17:39 — design → plan
- 2026-11-07 17:40 — plan → implement
- 2026-11-07 18:08 — verify run: pass
- 2026-11-07 18:08 — implement → verify
- 2026-11-07 18:13 — reopened at implement: Independent review: the positional exec_id backfill can duplicate an exec_id when an order has executions without fill events; the migration test does not prove the projection-first order_version source nor the real stored JSON path; an em dash in OrderAcceptCommandProcessorTest was corrupted.
- 2026-11-07 18:19 — verify run: pass
- 2026-11-07 18:19 — implement → verify
- 2026-11-07 18:20 — verify → done
- 2026-11-07 18:20 — autopilot off
