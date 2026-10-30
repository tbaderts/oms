---
id: SPEC-0011
title: Serve OKF concepts from MCP server
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-mcp-server, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
beads:
created: 2026-10-27
blocked_from:
blocked_reason:
---

# SPEC-0011 — Serve OKF concepts from MCP server

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

create a new spec ticket for converting knowledge base and mcp server and kb explorer to support use OKF https://github.com/GoogleCloudPlatform/open-knowledge-format. we also need to beef up the content and make sure we have a structured documentation, requiremnets, capabilities etc. if needed, create multiple tickets. (This ticket: make oms-mcp-server read the OKF bundle and expose concept type, tags, status, staleness, trust tier and links through its knowledge tools.)

## Log

- 2026-10-27 created
- 2026-10-27 17:44 — autopilot on
- 2026-10-27 17:45 — proposal gate passed; awaiting human approval
- 2026-10-27 17:46 — proposal approved by Toni Badertscher
- 2026-10-27 17:46 — proposal → design
- 2026-10-27 17:47 — autopilot on
- 2026-10-27 17:48 — design → plan
- 2026-10-27 17:49 — set modules = oms-mcp-server, oms-knowledge-base
- 2026-10-27 17:49 — plan → implement
- 2026-10-27 18:01 — verify run: pass
- 2026-10-27 18:01 — implement → verify
- 2026-10-28 05:29 — autopilot on
- 2026-10-28 05:31 — reopened at implement: Independent review NOT MET: overview lacks title/tags/updated/project keys (AC-1); no test of /api/kb/documents JSON; minor: metadata chunk line offsets, YAML scalar coercion, link resolution edge cases, sections endpoint on raw content, weak assertions
- 2026-10-28 05:38 — verify run: pass
- 2026-10-28 05:38 — implement → verify
- 2026-10-28 05:40 — reopened at implement: Re-review minor finding: YAML 1.1 booleans (yes/no/on/off) differ from tools/okf-check JSON schema
- 2026-10-28 05:41 — verify run: pass
- 2026-10-28 05:41 — implement → verify
- 2026-10-28 05:42 — verify → done
- 2026-10-28 05:42 — autopilot off
