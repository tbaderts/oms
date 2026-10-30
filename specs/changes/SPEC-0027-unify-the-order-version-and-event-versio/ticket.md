---
id: SPEC-0027
title: Unify the order version and event version
type: refactor
status: proposal
awaiting:
autopilot: false
modules: [oms-core, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0027 — Unify the order version and event version

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Address finding 6 of the architecture review (oms-core/docs/architecture-review-2026-10-30.md): txNr from JPA versioning and the event version from a max-plus-one query are two parallel sequences that mean almost the same thing. Make the event version the version of the order: the appender sets it on the entity before the save, the @Version column is that number, and the extra query per event goes away.

## Log

- 2026-10-30 created
