---
id: SPEC-0054
title: Improve oms-ui look, ergonomics, streaming limits
type: feature
status: done
awaiting:
autopilot: true
modules: [oms-ui]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-08
blocked_from:
blocked_reason:
---

# SPEC-0054 — Improve oms-ui look, ergonomics, streaming limits

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

oms-ui is the admin interface for oms. it was built a while ago and is fairly basic at the moment. we need to work on improving look & feel and ergonomics. it was designed to support live streaming, but we need to make sure that we limit the number of objects in memory to a configurable limit (a few thousand max). there is a way to switch between real-time and paging/query mode. real-time would should support a rolling window of objects in blotter up to the configured limit, where as paging mode should give people access to all data on a page (with configurable size) by page basis. we also need to make it look more professional, as it's the public face of our project.

## Log

- 2026-11-08 created
- 2026-11-08 05:22 — autopilot on
- 2026-11-08 05:23 — proposal gate passed; awaiting human approval
- 2026-11-08 05:33 — proposal approved by Toni Badertscher
- 2026-11-08 05:33 — proposal → design
- 2026-11-08 05:34 — design → plan
- 2026-11-08 05:34 — plan → implement
- 2026-11-08 06:51 — verify run: pass
- 2026-11-08 06:51 — implement → verify
- 2026-11-08 07:13 — verify run: fail
- 2026-11-08 07:16 — verify run: pass
- 2026-11-08 07:16 — verify → done
