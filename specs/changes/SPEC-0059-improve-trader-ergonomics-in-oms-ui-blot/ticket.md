---
id: SPEC-0059
title: Improve trader ergonomics in oms-ui blotters
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

# SPEC-0059 — Improve trader ergonomics in oms-ui blotters

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Follow-up to SPEC-0054, which barely touched ergonomics. Observed in the running app: numbers are left-aligned and prices are not formatted to fixed decimals (86.96 next to 170); Exec Type shows the raw code F instead of Trade; ID columns are truncated so Exec Id looks identical to Order Id; REST executions come back oldest first; Escape does not close the detail modal, whose title reads Orders Details; the mode toggle uses technical labels REST / Streaming; the toolbar is duplicated between the live and paging blotters. Make the blotters comfortable for traders and ops staff who spend their day in them: right-aligned, consistently formatted numbers, enum labels, readable ID columns, newest-first default sort, keyboard support (Escape, shortcuts), Live / History mode labels and one shared toolbar component.

## Log

- 2026-11-09 created
