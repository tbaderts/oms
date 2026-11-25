---
id: SPEC-0074
title: Show command and event history in order detail
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-ui, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-25
blocked_from:
blocked_reason:
---

# SPEC-0074 — Show command and event history in order detail

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

oms is a system based on event sourcing principles. as we store every command in an event table, it would be useful for the user to see command/event history in order detail screen of oms-ui, with some rendering of the json content of the jsonb fields of the database

## Log

- 2026-11-25 created
- 2026-11-25 05:39 — autopilot on
- 2026-11-25 05:40 — set modules = oms-ui, oms-knowledge-base
- 2026-11-25 05:40 — proposal gate passed; awaiting human approval
- 2026-11-25 05:40 — proposal approved by Toni Badertscher
- 2026-11-25 05:40 — proposal → design
- 2026-11-25 05:42 — design → plan
- 2026-11-25 05:42 — plan → implement
- 2026-11-25 05:50 — verify run: fail
- 2026-11-25 05:51 — verify run: pass
- 2026-11-25 05:51 — implement → verify
- 2026-11-25 05:54 — reopened at implement: Review: strengthen AC-5 keyboard test (real Enter/Space), AC-6 (commands failure, network error, Details still works), AC-4 fixture (explicit from:null, timestamp change); minors: cleared value as dash, keep timeline while refreshing, drop unused FieldValue component, JSON-escape string leaves.
- 2026-11-25 05:56 — verify run: pass
- 2026-11-25 05:56 — implement → verify
- 2026-11-25 05:57 — verify → done
- 2026-11-25 05:57 — autopilot off
