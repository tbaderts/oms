---
id: SPEC-0019
title: Publish OrderExecution events with order context
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-streaming-service, oms-knowledge-base]
approvals: [proposal]
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
- 2026-10-31 08:01 — autopilot on
- 2026-10-31 08:04 — proposal gate passed; awaiting human approval
- 2026-10-31 17:36 — proposal approved by Toni Badertscher
- 2026-10-31 17:36 — proposal → design
- 2026-10-31 17:39 — design → plan
- 2026-10-31 17:40 — plan → implement
- 2026-10-31 18:02 — verify run: fail
- 2026-10-31 18:03 — blocked: T-14 spec verify cannot pass while another session works in the same tree: SPEC-0035 (autopilot, implement T-4) has its red-first OrderEventQueryIntegrationTest in oms-core (5 failing tests, by design until its controller rewrite), and concurrent Gradle runs share oms-core/build. SPEC-0019's own failure is fixed but not re-run yet: EventSourcingIntegrationTest outbox counts 5->7 and 3->4, one more outbox row per fill by design. Everything else passed: oms-contracts, oms-streaming-service, oms-mcp-server, oms-exchange-simulator, and all SPEC-0019 tests. To unblock: let SPEC-0035 finish T-4 (or pause that session), then unblock SPEC-0019; this session resumes and re-runs spec verify.
- 2026-10-31 18:20 — unblocked → implement
- 2026-10-31 18:21 — verify run: pass
- 2026-10-31 18:23 — implement → verify
- 2026-10-31 18:27 — reopened at implement: Independent review: streaming dedup and execution cache keyed by execId alone, which is only unique per order (a fill on another order reusing an execId would be dropped); OrderExecution baseline has no compatibility test; the Goal's consumer-side Testcontainers test covers ordering but not deduplication; AC-4 sentinel on another partition; fill transactTime overwrites the order's on blotter events.
- 2026-10-31 18:32 — verify run: pass
- 2026-10-31 18:32 — implement → verify
- 2026-10-31 18:37 — verify run: pass
- 2026-10-31 18:37 — verify → done
- 2026-10-31 18:37 — autopilot off
