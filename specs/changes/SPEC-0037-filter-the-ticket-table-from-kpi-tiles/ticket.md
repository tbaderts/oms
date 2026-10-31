---
id: SPEC-0037
title: Filter the ticket table from KPI tiles
type: feature
status: proposal
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: []
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
