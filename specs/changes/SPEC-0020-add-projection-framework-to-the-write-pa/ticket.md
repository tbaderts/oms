---
id: SPEC-0020
title: Add projection framework to the write path
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-core, oms-contracts, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0020 — Add projection framework to the write path

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Roadmap ticket C of the architecture review (oms-core/docs/architecture-review-2026-10-30.md, section 5): introduce a Projection interface and a ProjectTask that runs every Projection bean inside the command transaction after UpdateOrderTask; give the outbox a generic payload column and a payload_type discriminator through a new Liquibase changeset; add the order_execution_view projection table and a GET /api/query/executions endpoint served from it; add a ProjectionRebuilder that rebuilds any projection from order_events and executions.

## Log

- 2026-10-30 created
