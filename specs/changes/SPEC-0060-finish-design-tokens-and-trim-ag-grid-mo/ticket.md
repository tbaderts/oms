---
id: SPEC-0060
title: Finish design tokens and trim AG Grid modules
type: refactor
status: proposal
awaiting:
autopilot: false
modules: [oms-ui]
approvals: []
owner: Toni Badertscher
created: 2026-11-10
blocked_from:
blocked_reason:
---

# SPEC-0060 — Finish design tokens and trim AG Grid modules

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Follow-up to SPEC-0058 (visual design), from its verification follow-ups: finish the token rule outside stylesheets and tidy the grid setup. (1) The AG Grid theme font sizes (agGridTheme.ts fontSize 13, headerFontSize 12) come from the type scale tokens instead of literals. (2) The AcmeLogo colours (default '#0f172a', green stroke '#22c55e') come from tokens, or are a documented brand exception. (3) The style-rule scan covers inline TSX styles and SVG colour attributes, so literals cannot return there. (4) AllCommunityModule (114 kB gzipped) is trimmed to the exact AG Grid modules both grids use, with a check that fails when a used feature's module is missing (AG Grid error #200 is only visible at run time). (5) The detail modal formats dates and numbers with the same formatters as the grid cells (DateTimeService, number formatting) instead of its own.

## Log

- 2026-11-10 created
