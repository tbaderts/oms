---
id: SPEC-0013
title: Render Mermaid diagrams in spec tickets
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-28
blocked_from:
blocked_reason:
---

# SPEC-0013 — Render Mermaid diagrams in spec tickets

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

I like to see mermaid diagrams rendered in the spec tickets feature when reviewing specs.

## Log

- 2026-10-28 created
- 2026-10-29 03:30 — autopilot on
- 2026-10-29 03:31 — proposal gate passed; awaiting human approval
- 2026-10-29 03:41 — proposal approved by Toni Badertscher
- 2026-10-29 03:41 — proposal → design
- 2026-10-29 03:43 — design → plan
- 2026-10-29 03:43 — plan → implement
- 2026-10-29 04:03 — verify run: pass
- 2026-10-29 04:04 — implement → verify
- 2026-10-29 04:06 — reopened at implement: Independent review: MermaidDiagram reuses one render id, so mermaid.render removes the live SVG on every re-render; rapid theme toggles can leave the diagram blank. Use a fresh id per render attempt.
- 2026-10-29 04:10 — implement → verify
- 2026-10-29 04:10 — verify run: pass
- 2026-10-29 04:11 — verify → done
- 2026-10-29 04:11 — autopilot off
