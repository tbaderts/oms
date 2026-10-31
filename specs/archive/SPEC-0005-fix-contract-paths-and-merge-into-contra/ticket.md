---
id: SPEC-0005
title: Fix contract paths and merge into Contracts view
type: fix
status: done
awaiting:
autopilot: false
modules: [developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-27
blocked_from:
blocked_reason:
---

# SPEC-0005 — Fix contract paths and merge into Contracts view

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

The spec editor tab is stale and shows nothing (it still points at oms-core/src/main/openapi and avro, which moved to oms-contracts); Domain Model and Code Generator are empty for the same reason. Agreed direction: fix the paths (defaults and existing saved config) so these views work again, and merge Specs Editor, Domain Model and Code Generator into one Contracts view with tabs to reduce sidebar clutter.

## Log

- 2026-10-27 created
- 2026-10-27 05:49 — autopilot on
- 2026-10-27 05:50 — proposal gate passed; awaiting human approval
- 2026-10-27 05:51 — proposal approved by Toni Badertscher
- 2026-10-27 05:51 — proposal → design
- 2026-10-27 05:53 — design → plan
- 2026-10-27 05:53 — plan → implement
- 2026-10-27 06:17 — verify run: pass
- 2026-10-27 06:17 — implement → verify
- 2026-10-27 06:23 — verify run: pass
- 2026-10-27 06:24 — verify → done
- 2026-10-27 06:24 — autopilot off
- 2026-10-31 06:19 — archived
