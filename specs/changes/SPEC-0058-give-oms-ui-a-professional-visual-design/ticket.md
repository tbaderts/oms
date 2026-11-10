---
id: SPEC-0058
title: Give oms-ui a professional visual design
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-ui, oms-core]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-09
blocked_from:
blocked_reason:
---

# SPEC-0058 — Give oms-ui a professional visual design

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Follow-up to SPEC-0054, whose look-and-feel part only removed emoji: the token file is the old VS Code palette renamed, spacing and font-size tokens are defined but never used (71 hard-coded font sizes), and the result still looks like a VS Code clone. Observed in the running app: badges with extreme letter spacing (B U Y, M A R K E T), text abbreviations used as fake icons in the detail modal (ID, INST, ORD), an unstyled page-size selector, grids that do not fill the panel, a VS Code blue status bar footer reading 2025, and leftover CRA boilerplate CSS and unused components. oms-ui is the public face of the project and has to look professional: an own palette and type scale applied everywhere through tokens, real SVG iconography, readable status badges, a reworked header and footer, and dead styles removed. Verification needs before/after screenshots and the requester's sign-off, not only DOM assertions.

## Log

- 2026-11-09 created
- 2026-11-09 22:44 — autopilot on
- 2026-11-09 23:04 — set modules = oms-ui, oms-core
- 2026-11-09 23:04 — proposal gate passed; awaiting human approval
- 2026-11-10 05:32 — proposal approved by Toni Badertscher
- 2026-11-10 05:32 — proposal → design
- 2026-11-10 05:35 — design → plan
- 2026-11-10 05:36 — plan → implement
- 2026-11-10 06:18 — verify run: fail
- 2026-11-10 06:49 — verify run: pass
- 2026-11-10 06:49 — implement → verify
- 2026-11-10 06:52 — AC-9 sign-off: on 2026-11-10 the requester (Toni Badertscher) reviewed screenshots/before and screenshots/after and the running app, and answered 'Sign off' in the Claude Code session, accepting the design as it is, including 'Day' in normal case and the mix of 'Unack'/'Live' with 'CXL'/'REJ'/'EXP'.
- 2026-11-10 06:52 — verify → done
- 2026-11-10 06:53 — autopilot off
