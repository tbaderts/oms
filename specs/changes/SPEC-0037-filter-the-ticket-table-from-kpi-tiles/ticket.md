---
id: SPEC-0037
title: Filter the ticket table from KPI tiles
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-31
blocked_from:
blocked_reason:
---

# SPEC-0037 — Filter the ticket table from KPI tiles

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Give the uncommitted KPI-tile filter work its own ticket (SPEC-0017 follow-up): the Active, In progress and Awaiting approval tiles filter the dashboard ticket table, plus the vitest.config.ts worker limit, so it can be verified and committed separately from SPEC-0017 and SPEC-0031.

## Log

- 2026-10-31 created
- 2026-10-31 18:45 — autopilot on
- 2026-10-31 18:46 — proposal gate passed; awaiting human approval
- 2026-10-31 18:46 — proposal approved by Toni Badertscher
- 2026-10-31 18:46 — proposal → design
- 2026-10-31 18:47 — design → plan
- 2026-10-31 18:48 — plan → implement
- 2026-10-31 18:50 — verify run: pass
- 2026-10-31 18:50 — implement → verify
- 2026-10-31 18:52 — reopened at proposal: AC-5 omits its precondition: the stage select keeps the My/All tickets mode, while a tile click switches to All tickets, so in the default My tickets view the select lists fewer tickets than the tile. Reword AC-5's Given to 'with All tickets selected' (independent review finding 1).
- 2026-10-31 18:52 — proposal gate passed; awaiting human approval
- 2026-10-31 18:53 — proposal approved by Toni Badertscher
- 2026-10-31 18:53 — proposal → design
- 2026-10-31 18:53 — design → plan
- 2026-10-31 18:53 — plan → implement
- 2026-10-31 18:55 — verify run: pass
- 2026-10-31 18:55 — implement → verify
- 2026-10-31 18:56 — verify → done
- 2026-10-31 18:56 — autopilot off
