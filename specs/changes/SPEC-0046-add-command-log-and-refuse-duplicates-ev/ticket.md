---
id: SPEC-0046
title: Add command log and refuse duplicates everywhere
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-core, oms-contracts, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-11-07
blocked_from:
blocked_reason:
---

# SPEC-0046 — Add command log and refuse duplicates everywhere

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Ticket B of the event sourcing and CQRS review (findings F-2, F-13 and F-20; target architecture sections 4.2 and 5.4): every command the OMS receives leaves a durable trace with its outcome. Add a command_log table (command_id, type, order_id, received_at, source REST, Kafka or scheduler, principal, outcome APPLIED, REFUSED or FAILED, reason, event_version) written in a REQUIRES_NEW transaction after each pipeline result on every path, including refusals that roll the command back; expose it as GET /api/query/orders/{orderId}/commands in the query contract; map a violation of uq_order_events_order_id_command_id to a typed duplicate-command refusal answered 409 on REST and acknowledged on Kafka, on every path and not only in the lifecycle pipeline; move the accept command into the lifecycle pipeline as LifecycleAction.ACCEPT so every state transition goes through the same lock, dedup and state-machine tasks (P-10); remove the command-less process(Execution) overload.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture. Independent. SPEC-0048 depends on it.
