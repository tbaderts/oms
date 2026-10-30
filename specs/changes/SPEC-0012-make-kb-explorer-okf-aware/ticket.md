---
id: SPEC-0012
title: Make KB explorer OKF-aware
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-kb-explorer, oms-mcp-server, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-27
blocked_from:
blocked_reason:
---

# SPEC-0012 — Make KB explorer OKF-aware

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

create a new spec ticket for converting knowledge base and mcp server and kb explorer to support use OKF https://github.com/GoogleCloudPlatform/open-knowledge-format. we also need to beef up the content and make sure we have a structured documentation, requiremnets, capabilities etc. if needed, create multiple tickets. (This ticket: make oms-kb-explorer browse the OKF bundle by type and hierarchy, show status, staleness, trust tier and sources, and navigate links and backlinks.)

## Log

- 2026-10-27 created
- 2026-10-28 05:46 — autopilot on
- 2026-10-28 05:47 — set modules = oms-kb-explorer, oms-mcp-server, oms-knowledge-base
- 2026-10-28 05:47 — proposal gate passed; awaiting human approval
- 2026-10-28 05:49 — proposal approved by Toni Badertscher
- 2026-10-28 05:49 — proposal → design
- 2026-10-28 05:49 — autopilot on
- 2026-10-28 05:50 — design → plan
- 2026-10-28 05:51 — plan → implement
- 2026-10-28 06:09 — verify run: pass
- 2026-10-28 06:10 — implement → verify
- 2026-10-28 06:14 — reopened at implement: Independent review: browser Back/Forward broken (no popstate), folder order by filename, source URL schemes, link edge cases vs server, logic left in components, weak screenshot evidence
- 2026-10-28 06:18 — verify run: pass
- 2026-10-28 06:19 — implement → verify
- 2026-10-28 06:21 — verify → done
- 2026-10-28 06:21 — autopilot off
