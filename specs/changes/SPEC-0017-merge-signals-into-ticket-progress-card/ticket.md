---
id: SPEC-0017
title: Merge signals into ticket progress card
type: feature
status: blocked
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-30
blocked_from: verify
blocked_reason: Verify: the independent spec-reviewer run stopped on the weekly API limit (resets 4am Europe/Berlin). Implementation done, spec verify PASS (2026-10-30T07:33Z); verification.md waits for the review. To resume: spec unblock SPEC-0017, then /spec-run SPEC-0017.
---

# SPEC-0017 — Merge signals into ticket progress card

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Combine the signals header/title part with the ticket progress panel and make the panel expand activities below when clicking on it, to save a lot of screen space. Chosen layout: one full-width card with the donut and legend on the left and Your turn on the right, and a one-line Activity bar below (latest signal and count of new ones) that expands the activity feed underneath when clicked.

## Log

- 2026-10-30 created
- 2026-10-30 07:20 — autopilot on
- 2026-10-30 07:20 — proposal gate passed; awaiting human approval
- 2026-10-30 07:22 — proposal approved by Toni Badertscher
- 2026-10-30 07:22 — proposal → design
- 2026-10-30 07:23 — autopilot on
- 2026-10-30 07:24 — design → plan
- 2026-10-30 07:25 — plan → implement
- 2026-10-30 07:33 — verify run: pass
- 2026-10-30 07:33 — implement → verify
- 2026-10-30 11:03 — blocked: Verify: the independent spec-reviewer run stopped on the weekly API limit (resets 4am Europe/Berlin). Implementation done, spec verify PASS (2026-10-30T07:33Z); verification.md waits for the review. To resume: spec unblock SPEC-0017, then /spec-run SPEC-0017.
- 2026-10-30 11:03 — autopilot off
