---
id: SPEC-0010
title: Structure KB into requirements and capabilities
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-27
blocked_from:
blocked_reason:
---

# SPEC-0010 — Structure KB into requirements and capabilities

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

create a new spec ticket for converting knowledge base and mcp server and kb explorer to support use OKF https://github.com/GoogleCloudPlatform/open-knowledge-format. we also need to beef up the content and make sure we have a structured documentation, requiremnets, capabilities etc. if needed, create multiple tickets. (This ticket: restructure and expand the KB content into typed OKF concepts - capabilities, requirements, domain concepts, architecture, APIs and events - linked to each other and to the code.)

## Log

- 2026-10-27 created
- 2026-10-27 16:53 — autopilot on
- 2026-10-27 16:55 — proposal gate passed; awaiting human approval
- 2026-10-27 17:04 — proposal approved by Toni Badertscher
- 2026-10-27 17:04 — proposal → design
- 2026-10-27 17:04 — autopilot on
- 2026-10-27 17:06 — design → plan
- 2026-10-27 17:07 — plan → implement
- 2026-10-27 17:22 — verify run: pass
- 2026-10-27 17:22 — implement → verify
- 2026-10-27 17:30 — reopened at implement: Independent review: Known gaps omit order-lifecycle.md contradictions with the code; FR-002 and NFR-005 marked implemented without adequate tests; minor content inaccuracies
- 2026-10-27 17:33 — verify run: pass
- 2026-10-27 17:33 — implement → verify
- 2026-10-27 17:34 — verify → done
- 2026-10-27 17:34 — autopilot off
