---
id: SPEC-0066
title: Align oms-kb-explorer look and feel with oms-ui
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-kb-explorer, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-16
blocked_from:
blocked_reason:
---

# SPEC-0066 — Align oms-kb-explorer look and feel with oms-ui

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

I want to improve UI look and feel, ergonomics and user experience of oms-kb-explorer. I think it should be more alligned with oms-ui.

## Log

- 2026-11-16 created
- 2026-11-16 10:48 — autopilot on
- 2026-11-16 10:50 — set modules = oms-kb-explorer, oms-knowledge-base
- 2026-11-16 10:50 — proposal gate passed; awaiting human approval
- 2026-11-16 10:50 — proposal approved by Toni Badertscher
- 2026-11-16 10:50 — proposal → design
- 2026-11-16 10:52 — design → plan
- 2026-11-16 10:52 — plan → implement
- 2026-11-16 11:05 — verify run: fail
- 2026-11-16 11:09 — verify run: pass
- 2026-11-16 11:15 — verify run: pass
- 2026-11-16 11:15 — implement → verify
- 2026-11-16 11:20 — reopened at implement: verify review NOT MET: AC-9 regression tests missing (popstate, #anchor, TOC, links, tree toggle/filters); AC-2 scanner blind spots; proxy assertions in AC-7/AC-8; clear doesn't cancel in-flight search; README stale; passWithNoTests
- 2026-11-16 11:25 — verify run: pass
- 2026-11-16 11:25 — implement → verify
- 2026-11-16 11:26 — reopened at implement: re-review minor: the style-rule allow-list exempts the logo line from every rule; scope it to the rules it waives
- 2026-11-16 11:27 — implement → verify
- 2026-11-16 11:27 — verify run: pass
- 2026-11-16 11:27 — verify → done
- 2026-11-16 11:28 — autopilot off
