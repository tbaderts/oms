---
id: SPEC-0019
title: Publish OrderExecution events with order context
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-streaming-service, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0019 — Publish OrderExecution events with order context

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Roadmap ticket B of the architecture review (oms-core/docs/architecture-review-2026-10-30.md, section 5, and findings 15 and 16): add an OrderExecution Avro record carrying the execution, the order context, orderVersion and tradeDate, published on oms_order_executions keyed by rootOrderId from the same transaction as the fill through the outbox; add rootOrderId and orderVersion to Execution.avsc with null defaults; key oms_orders and oms_executions by rootOrderId; let the streaming blotter show fills with their order fields; add a consumer-side Testcontainers test that proves ordering and deduplication of the new topic.

## Log

- 2026-10-30 created
