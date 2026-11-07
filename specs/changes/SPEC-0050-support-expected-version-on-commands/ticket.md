---
id: SPEC-0050
title: Support expected version on commands
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-11-07
blocked_from:
blocked_reason:
---

# SPEC-0050 — Support expected version on commands

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

From section 7 of the event sourcing and CQRS review (expected version, adopted) and target architecture sections 5.1 and 7.1: a client that acts on a snapshot can say which version it saw, and a client that changes an order can wait for its own write. Add an optional expectedVersion to the OpenAPI Command base and to the Avro CommandHeader with a null default; refuse a command whose expectedVersion differs from the order's current txNr as a refusal, not a conflict, recorded in the command log; add the event version produced by an applied command to CommandResult as an additive field; document in the query contract that a client needing read-your-writes waits until the order's eventVersion from search is at least that version.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture. Depends on SPEC-0046 for the command log entry of a refusal.
