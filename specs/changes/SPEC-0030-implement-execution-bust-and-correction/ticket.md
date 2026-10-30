---
id: SPEC-0030
title: Implement execution bust and correction
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0030 — Implement execution bust and correction

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Address finding 14 of the architecture review (oms-core/docs/architecture-review-2026-10-30.md): ExecutionBustCmd and ExecutionWhackCmd exist in the contracts with no processor, so an unknown command goes to the dead-letter topic and booking cannot handle corrections. Implement bust and correction as lifecycle actions on the execution that reverse or replace its quantities on the order, define what a bust and a correction publish on the execution topics as change E5 of the booking paper asks, and ripple the change upward once order trees exist.

## Log

- 2026-10-30 created
