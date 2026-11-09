---
id: SPEC-0058
title: Give oms-ui a professional visual design
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-ui]
approvals: []
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
