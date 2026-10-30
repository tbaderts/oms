---
id: SPEC-0028
title: Use decimals for quantities in Order.avsc
type: fix
status: proposal
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0028 — Use decimals for quantities in Order.avsc

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Address finding 9 of the architecture review (oms-core/docs/architecture-review-2026-10-30.md): the command payload Order.avsc uses double for quantities and prices while OrderMessage.avsc uses decimals, which rounds on the way in. Change them to decimal logical types; this is a BREAKING contract change under policy P-04 and must list and update every producer and consumer of OrderCreateCmd on Kafka together.

## Log

- 2026-10-30 created
