---
id: SPEC-0080
title: Extract knowledge server into its own repository
type: refactor
status: proposal
awaiting: proposal
autopilot: true
modules: [oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-11-28
blocked_from:
blocked_reason:
---

# SPEC-0080 — Extract knowledge server into its own repository

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

I want to move oms-mcp-server & oms-kb-explorer into a new git repo: https://github.com/tbaderts/knowledge-server. both servcices should be agnostic of oms and just server as a general purpose knowledge-server with a react user interface. we should also rename the services to something that reflects it's real purpose

## Log

- 2026-11-28 created
- 2026-11-28 07:16 — proposal gate passed; awaiting human approval
- 2026-11-28 07:17 — proposal approved by Toni Badertscher
- 2026-11-28 07:17 — proposal → design
- 2026-11-28 07:18 — autopilot on
- 2026-11-28 07:21 — design → plan
- 2026-11-28 07:23 — plan → implement
- 2026-11-28 07:31 — reopened at proposal: Requester renamed the components: kb-server and kb-explorer instead of ContextCore (contextcore-server / contextcore-ui); product is the knowledge-server repo.
- 2026-11-28 07:32 — proposal gate passed; awaiting human approval
- 2026-11-28 07:33 — proposal approved by Toni Badertscher
- 2026-11-28 07:33 — proposal → design
- 2026-11-28 07:33 — design → plan
- 2026-11-28 07:33 — plan → implement
- 2026-11-28 07:59 — set modules = oms-knowledge-base
- 2026-11-28 08:14 — reopened at proposal: AC-8 as written requires rewriting historical records (62 other ticket folders in specs/changes, the dated ARCHITECTURE-REVIEW.md and the point_in_time assessment architecture-review-2026-10-30.md); scope it to live documents. All 29 implementation tasks are done and verified.
- 2026-11-28 08:14 — proposal gate passed; awaiting human approval
