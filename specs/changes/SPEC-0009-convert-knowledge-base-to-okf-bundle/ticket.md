---
id: SPEC-0009
title: Convert knowledge base to OKF bundle
type: refactor
status: done
awaiting:
autopilot: false
modules: [oms-knowledge-base, oms-kb-explorer]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-27
blocked_from:
blocked_reason:
---

# SPEC-0009 — Convert knowledge base to OKF bundle

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

create a new spec ticket for converting knowledge base and mcp server and kb explorer to support use OKF https://github.com/GoogleCloudPlatform/open-knowledge-format. we also need to beef up the content and make sure we have a structured documentation, requiremnets, capabilities etc. if needed, create multiple tickets. (This ticket: make oms-knowledge-base a conformant OKF v0.2 bundle - frontmatter with type, index.md/log.md, provenance - with an automated conformance check.)

## Log

- 2026-10-27 created
- 2026-10-27 15:43 — autopilot on
- 2026-10-27 15:44 — proposal gate passed; awaiting human approval
- 2026-10-27 16:05 — proposal approved by Toni Badertscher
- 2026-10-27 16:05 — proposal → design
- 2026-10-27 16:08 — reopened at proposal: Impact row was wrong: oms-kb-explorer renders raw content via ReactMarkdown without stripping front matter, so the YAML block would show as body text after conversion
- 2026-10-27 16:08 — proposal gate passed; awaiting human approval
- 2026-10-27 16:16 — set modules = oms-knowledge-base, oms-kb-explorer
- 2026-10-27 16:26 — proposal approved by Toni Badertscher
- 2026-10-27 16:26 — proposal → design
- 2026-10-27 16:27 — autopilot on
- 2026-10-27 16:27 — design → plan
- 2026-10-27 16:27 — plan → implement
- 2026-10-27 16:37 — verify run: pass
- 2026-10-27 16:37 — implement → verify
- 2026-10-27 16:46 — verify run: pass
- 2026-10-27 16:46 — verify → done
- 2026-10-27 16:46 — autopilot off
