---
id: SPEC-0026
title: Isolate failing aggregates in the outbox relay
type: fix
status: proposal
awaiting:
autopilot: false
modules: [oms-core]
approvals: []
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0026 — Isolate failing aggregates in the outbox relay

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Address finding 7 of the architecture review (oms-core/docs/architecture-review-2026-10-30.md): the relay stops the whole batch on one failed send, so one poison message delays every aggregate for up to ten polls, and one synchronous send per row caps throughput near 500 messages per second per instance. Skip only rows of the failed aggregate for the rest of the batch, send the batch asynchronously and await it, and add a gauge for the age of the oldest pending outbox row.

## Log

- 2026-10-30 created
