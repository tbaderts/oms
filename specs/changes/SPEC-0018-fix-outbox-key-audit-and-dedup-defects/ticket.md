---
id: SPEC-0018
title: Fix outbox key, audit and dedup defects
type: fix
status: proposal
awaiting:
autopilot: false
modules: [oms-core, oms-contracts, oms-streaming-service, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0018 — Fix outbox key, audit and dedup defects

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Address findings 1 to 5 of the architecture review (oms-core/docs/architecture-review-2026-10-30.md, section 8): key execution messages by orderId (rootOrderId once trees exist) instead of execId and document the key of every topic; pass the ExecutionCreateCmd through for fills received over REST so the event log records the command; expose the event version in the query DTO and deduplicate the streaming snapshot on it instead of the database id; replace the event-history scan in DeduplicateCommandTask with a command_id column on order_events under a unique (order_id, command_id) index; make findByRootOrderId return a list and add findByParentOrderId.

## Log

- 2026-10-30 created
