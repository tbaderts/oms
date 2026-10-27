---
id: SPEC-0006
title: Dashboard portfolio and full-width ticket workspace
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
beads:
created: 2026-10-27
blocked_from:
blocked_reason:
---

# SPEC-0006 — Dashboard portfolio and full-width ticket workspace

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

I am not happy with the layout of dashboard and spec tickets tab. Dashboard has a lot of redundancy with the sidebar and spec tickets is a bit crowded. Move some of that to the dashboard and make more room for the actual ticket pane: use the ticket pane across the main panel with the ticket selector in the top bar, and show ticket status and progress on the dashboard, like a chart of the distribution of ticket states. Agreed direction: dashboard drops the quick-link cards and getting-started card and becomes the portfolio view (stage distribution chart, task completion, needs-me list, ticket table with filters); Spec Tickets becomes a full-width single-ticket workspace with a searchable ticket switcher in the header, documents/editor as the main column and gate, actions, tasks and evidence in a side rail.

## Log

- 2026-10-27 created
- 2026-10-27 06:25 — autopilot on
- 2026-10-27 06:26 — proposal gate passed; awaiting human approval
- 2026-10-27 06:27 — proposal approved by Toni Badertscher
- 2026-10-27 06:27 — proposal → design
- 2026-10-27 06:31 — design → plan
- 2026-10-27 06:31 — plan → implement
- 2026-10-27 06:51 — verify run: pass
- 2026-10-27 06:51 — blocked: T-9 runtime look needs a second cockpit instance, which cannot start while the user's own cockpit (npm start, PID 45780) holds the event WebSocket port 9321 (the second instance stops at a main-process error dialog). T-1..T-8 done; spec verify passes (112 tests). Need: the user closes their cockpit for the check, or decides to skip the runtime look.
- 2026-10-27 07:24 — unblocked → implement
- 2026-10-27 07:27 — verify run: pass
- 2026-10-27 07:27 — implement → verify
- 2026-10-27 07:31 — reopened at implement: independent review: chart percentages rounded twice (5 of 11 shows 46%); store errors not shown on the Dashboard; plus minors (dead perStage, AC-4 controls untested, switcher focus/scroll/blur, run() id after cancelled select, design text)
- 2026-10-27 07:36 — verify run: pass
- 2026-10-27 07:38 — implement → verify
- 2026-10-27 07:46 — verify run: pass
- 2026-10-27 07:47 — verify → done
- 2026-10-27 07:47 — autopilot off
