---
id: SPEC-0008
title: Add command templates to the API Explorer
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-27
blocked_from:
blocked_reason:
---

# SPEC-0008 — Add command templates to the API Explorer

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

When we use the API Explorer we get just a minimal template with required fields but we still have to fill in a lot of stuff manually. Make this smarter: have templates like the ones used with the VS Code REST client (oms-core/rest.http), with values that change per send (unique clOrdId, current timestamps, the followed orderId), importable from .http files, and savable from what we have already sent.

## Log

- 2026-10-27 created
- 2026-10-27 15:17 — proposal gate passed; awaiting human approval
- 2026-10-27 15:21 — proposal approved by Toni Badertscher
- 2026-10-27 15:21 — proposal → design
- 2026-10-27 15:24 — design → plan
- 2026-10-27 15:25 — plan → implement
- 2026-10-27 15:44 — verify run: pass
- 2026-10-27 15:44 — implement → verify
- 2026-10-27 15:48 — reopened at implement: Review finding 1 (major): saving a template body into another file drops its file variables; minors 2-4, 6
- 2026-10-27 15:51 — verify run: pass
- 2026-10-27 15:52 — implement → verify
- 2026-10-27 15:52 — verify → done
- 2026-10-31 06:19 — archived
