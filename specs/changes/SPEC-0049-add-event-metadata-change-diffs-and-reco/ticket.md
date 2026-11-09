---
id: SPEC-0049
title: Add event metadata, change diffs and reconciliation
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

# SPEC-0049 — Add event metadata, change diffs and reconciliation

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Ticket E of the event sourcing and CQRS review (findings F-10, F-12 and F-14; target architecture sections 4.2, 4.3 and 7.4): events say what changed and who caused it, and the log is checked against the state at runtime. Add correlation_id, causation_id, principal and source columns to order_events, filled from the command header on Kafka, the authenticated caller on REST and the scheduler otherwise; add a changes jsonb column holding the field-level diff between the previous and the new snapshot, computed in OrderEventAppender from the order as loaded and as saved; expose both on OrderEventDto as additive fields; add a scheduled reconciliation sampler that compares a sample of recently changed and random orders with OrderReplayService.replay and checks contiguity, exposing the gauges oms.event_log.inconsistent and oms.event_log.gaps and logging each mismatch with its order id; store the writer schema id of PROJECTION outbox payloads on the row and decode with writer and reader schemas so a deployment between staging and publishing cannot hold an aggregate.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture. Independent. SPEC-0022 depends on its causation columns.
- 2026-11-08 12:07 — autopilot on
- 2026-11-08 12:10 — proposal gate passed; awaiting human approval
- 2026-11-08 14:04 — proposal approved by Toni Badertscher
- 2026-11-08 14:04 — proposal → design
- 2026-11-08 14:07 — design → plan
- 2026-11-08 14:07 — plan → implement
- 2026-11-08 16:53 — reopened at proposal: AC-3 is unsatisfiable as approved: OMS has no partially-filled state (State is NEW, UNACK, LIVE, FILLED, CXL, REJ, CLOSED, EXP); a partial fill leaves the order LIVE. Correcting AC-3 only: state is not listed, avgPx and txNr are.
- 2026-11-08 16:53 — proposal gate passed; awaiting human approval
- 2026-11-08 16:57 — proposal approved by Toni Badertscher
- 2026-11-08 16:57 — proposal → design
- 2026-11-08 16:58 — design → plan
- 2026-11-08 16:58 — plan → implement
- 2026-11-08 17:01 — reopened at proposal: AC-3 names avgPx, but the order entity has no avgPx field (the fill's average price is on the execution row), so it can never be listed. Removing it from AC-3; the rest unchanged. All other ACs were rechecked against the code.
- 2026-11-08 17:01 — proposal gate passed; awaiting human approval
- 2026-11-08 17:16 — proposal approved by Toni Badertscher
- 2026-11-08 17:16 — proposal → design
- 2026-11-08 17:16 — design → plan
- 2026-11-08 17:16 — plan → implement
- 2026-11-08 17:38 — verify run: fail
- 2026-11-08 17:46 — verify run: pass
- 2026-11-08 17:46 — implement → verify
- 2026-11-08 17:53 — reopened at implement: Independent review: majors 1 (changes returned as doubles, not exact) and 2 (recent-orders sample scans order_events, no time_stamp index); minors 3, 4, 5, 7, 8, 9
- 2026-11-08 18:06 — verify run: pass
- 2026-11-08 18:06 — implement → verify
- 2026-11-08 18:06 — verify → done
- 2026-11-08 18:06 — autopilot off
