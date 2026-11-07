---
id: SPEC-0049
title: Add event metadata, change diffs and reconciliation
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

# SPEC-0049 — Add event metadata, change diffs and reconciliation

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Ticket E of the event sourcing and CQRS review (findings F-10, F-12 and F-14; target architecture sections 4.2, 4.3 and 7.4): events say what changed and who caused it, and the log is checked against the state at runtime. Add correlation_id, causation_id, principal and source columns to order_events, filled from the command header on Kafka, the authenticated caller on REST and the scheduler otherwise; add a changes jsonb column holding the field-level diff between the previous and the new snapshot, computed in OrderEventAppender from the order as loaded and as saved; expose both on OrderEventDto as additive fields; add a scheduled reconciliation sampler that compares a sample of recently changed and random orders with OrderReplayService.replay and checks contiguity, exposing the gauges oms.event_log.inconsistent and oms.event_log.gaps and logging each mismatch with its order id; store the writer schema id of PROJECTION outbox payloads on the row and decode with writer and reader schemas so a deployment between staging and publishing cannot hold an aggregate.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture. Independent. SPEC-0022 depends on its causation columns.
