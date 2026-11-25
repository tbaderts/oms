---
id: SPEC-0076
title: Make developer cockpit a standalone generic tool
type: feature
status: done
awaiting:
autopilot: false
modules: [developer-cockpit, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-25
blocked_from:
blocked_reason:
---

# SPEC-0076 — Make developer cockpit a standalone generic tool

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

developer-cockpit has a monitoring tab that gives some overview of oms health and some KPIs. I would like to move developer-cockpit out of the oms repo into a new home: https://github.com/tbaderts/developer-cockpit.git. as part of that process, I would like to make it agnostic of oms and just be a generic tool for spec-driven development mainly, with some light weight infrastructure management capabilities. so to have a monitoring screen that's useful for other projects as well, we should have the services and endpoints we want to monitor configurable. I'm not sure if we just keep it basic or add other stuff as well, just have to be sure we don't add proprieatary logic. provide some sample config for all existing oms services. maybe you have some ideas about what we can add to make it look less boring

## Log

- 2026-11-25 created
- 2026-11-25 10:22 — autopilot on
- 2026-11-25 10:24 — proposal gate passed; awaiting human approval
- 2026-11-25 10:43 — proposal approved by Toni Badertscher
- 2026-11-25 10:43 — proposal → design
- 2026-11-25 10:46 — design → plan
- 2026-11-25 10:48 — plan → implement
- 2026-11-25 12:02 — verify run: pass
- 2026-11-25 17:42 — implement → verify
- 2026-11-25 17:42 — verify → done
- 2026-11-25 17:42 — autopilot off
