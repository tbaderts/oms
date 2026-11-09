---
id: SPEC-0057
title: Make oms-ui streaming hold up under load
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-ui, oms-streaming-service]
approvals: []
owner: Toni Badertscher
created: 2026-11-09
blocked_from:
blocked_reason:
---

# SPEC-0057 — Make oms-ui streaming hold up under load

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Follow-up to SPEC-0054, which capped the number of rows but did not address high update rates. Today every event copies the whole row map, rebuilds the row array, pushes all rows to AG Grid and re-renders three times; ingesting an 8,300-event snapshot took more than 5 seconds with nothing else running. Eviction drops rows by first arrival, so a busy order that keeps getting fills is evicted before a quiet one. The client requests unlimited events and the server sends the full snapshot even though the client keeps only maxStreamingRows. Make the live blotters cope with a large number of incoming updates: batch updates into the grid as delta transactions, evict the least recently updated rows, load the snapshot in bulk and bounded to the newest N rows, add a pause/resume control and a showing N of M indicator. Acceptance must be measured (sustained event rate, frame budget, flat memory), not only unit-tested.

## Log

- 2026-11-09 created
