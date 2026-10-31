---
id: SPEC-0016
title: Replace Needs me with live signals panel
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0016 — Replace Needs me with live signals panel

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

The Needs me section of the developer-cockpit dashboard looks a bit dull and is mostly redundant. Either add some alerting and a real-time console or indicator, or arrange the tiles differently to save screen space; preferred is the idea of more direct feedback and signals back into the console.

## Log

- 2026-10-30 created
- 2026-10-30 06:34 — autopilot on
- 2026-10-30 06:35 — proposal gate passed; awaiting human approval
- 2026-10-30 06:48 — proposal approved by Toni Badertscher
- 2026-10-30 06:48 — proposal → design
- 2026-10-30 06:51 — design → plan
- 2026-10-30 06:51 — plan → implement
- 2026-10-30 07:08 — verify run: pass
- 2026-10-30 07:09 — implement → verify
- 2026-10-30 07:11 — reopened at implement: Review: Your turn must put the user's own entries first across awaiting and blocked (AC-3); order a batch of new signals by time; cap Your turn height
- 2026-10-30 07:14 — verify run: fail
- 2026-10-30 07:14 — implement → verify
- 2026-10-30 07:15 — verify run: pass
- 2026-10-30 07:15 — verify → done
- 2026-10-30 07:15 — autopilot off
- 2026-10-31 06:19 — archived
