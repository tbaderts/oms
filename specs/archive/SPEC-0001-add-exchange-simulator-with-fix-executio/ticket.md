---
id: SPEC-0001
title: Add exchange simulator with FIX execution workflow
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-24
blocked_from:
blocked_reason:
---

# SPEC-0001 — Add exchange simulator with FIX execution workflow

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

oms is a trading system that manages the trading life cycle of a securities order. currently we have limited testing capability, because we have no market to connect to. build a simulator component/service that acts like a market/stock exchange and subscribes to oms orders (kafka), evaluates the order economics and sends back executions (via executing create execution commands on oms). we want to use FIX protocol semantics as much as possible, so the worflow should be us sending new order and getting ack in return (execution report) followed by execution itself, either single or multiple one. we also should think of cancel and reject scnenarios, but likely we have to add support in oms model and commands to support all of that

## Log

- 2026-10-24 created
- 2026-10-24 06:33 — autopilot on
- 2026-10-24 06:36 — proposal gate passed; awaiting human approval
- 2026-10-24 06:38 — autopilot on
- 2026-10-24 06:43 — proposal approved by Toni Badertscher
- 2026-10-24 06:43 — proposal → design
- 2026-10-24 06:48 — design → plan
- 2026-10-24 06:48 — plan → implement
- 2026-10-24 07:30 — verify run: pass
- 2026-10-24 07:30 — implement → verify
- 2026-10-24 07:37 — reopened at design: Independent review (blocking): replayed OrderCancelRequestCmd/OrderCancelRejectCmd re-apply after a cancel reject because state preconditions become true again; need command identity (optional commandId) for P-08/AC-10
- 2026-10-24 07:38 — design → plan
- 2026-10-24 07:39 — plan → implement
- 2026-10-24 07:47 — verify run: pass
- 2026-10-24 07:47 — implement → verify
- 2026-10-25 05:56 — verify run: pass
- 2026-10-25 05:57 — verify → done
- 2026-10-25 06:01 — verify run: pass
- 2026-10-31 06:19 — archived
