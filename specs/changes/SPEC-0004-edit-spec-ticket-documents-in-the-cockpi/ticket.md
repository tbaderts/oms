---
id: SPEC-0004
title: Edit spec ticket documents in the cockpit
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-26
blocked_from:
blocked_reason:
---

# SPEC-0004 — Edit spec ticket documents in the cockpit

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Continue work on developer-cockpit and add more functionality around spec-driven development. Chosen direction: a ticket document editor - edit proposal/design/tasks/verification.md inside the cockpit with a live gate check (lint as you type), and tick tasks. This was out of scope for SPEC-0002.

## Log

- 2026-10-26 created
- 2026-10-26 12:11 — autopilot on
- 2026-10-26 12:13 — proposal gate passed; awaiting human approval
- 2026-10-26 12:16 — proposal approved by Toni Badertscher
- 2026-10-26 12:16 — proposal → design
- 2026-10-26 12:19 — design → plan
- 2026-10-26 12:20 — plan → implement
- 2026-10-26 12:22 — autopilot off
- 2026-10-26 12:23 — autopilot on
- 2026-10-26 12:35 — verify run: pass
- 2026-10-26 12:35 — implement → verify
- 2026-10-26 12:41 — reopened at implement: independent review: Monaco is loaded from the jsdelivr CDN, which the renderer CSP blocks, so the editor never loads in the app; plus minor findings (Advance test by proxy, timing not measured, no Reopen hint, stale draft state, editor not closed on stage change, stdin EPIPE, force creates missing file)
- 2026-10-26 12:54 — verify run: fail
- 2026-10-26 12:56 — verify run: pass
- 2026-10-26 12:56 — implement → verify
- 2026-10-26 13:04 — verify run: pass
- 2026-10-26 13:05 — verify → done
- 2026-10-26 13:05 — autopilot off
