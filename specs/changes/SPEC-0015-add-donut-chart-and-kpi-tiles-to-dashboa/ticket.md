---
id: SPEC-0015
title: Add donut chart and KPI tiles to dashboard
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
beads:
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0015 — Add donut chart and KPI tiles to dashboard

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Improve the dashboard screen of developer-cockpit with a more fancy overview at the top level: a pie chart showing ticket progress by states, KPI tiles, and more colors.

## Log

- 2026-10-30 created
- 2026-10-30 06:00 — proposal gate passed; awaiting human approval
- 2026-10-30 06:04 — proposal approved by Toni Badertscher
- 2026-10-30 06:04 — proposal → design
- 2026-10-30 06:05 — autopilot on
- 2026-10-30 06:07 — reopened at proposal: AC-2 (hue gap >= 25 deg and 3:1 contrast) is a weak proxy that conflicts with colour-blind safety: palettes meeting it fail the dataviz validator, and the validated palette fails it; replace with validator-based criteria
- 2026-10-30 06:07 — proposal gate passed; awaiting human approval
- 2026-10-30 06:08 — proposal approved by Toni Badertscher
- 2026-10-30 06:08 — proposal → design
- 2026-10-30 06:10 — design → plan
- 2026-10-30 06:10 — plan → implement
- 2026-10-30 06:24 — verify run: pass
- 2026-10-30 06:24 — implement → verify
- 2026-10-30 06:26 — reopened at implement: Review: donut segment buttons sit inside svg role=img (children presentational); 1° clamp overlaps; stale IA doc line
- 2026-10-30 06:27 — verify run: fail
- 2026-10-30 06:27 — implement → verify
- 2026-10-30 06:28 — verify run: pass
- 2026-10-30 06:29 — verify → done
- 2026-10-30 06:29 — autopilot off
