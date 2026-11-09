---
id: SPEC-0055
title: Rebuild mission-control as lightweight load-test tool
type: feature
status: done
awaiting:
autopilot: false
modules: [mission-control, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-08
blocked_from:
blocked_reason:
---

# SPEC-0055 — Rebuild mission-control as lightweight load-test tool

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

the tool should create orders from rest client at a configurable rate, subscribe to order and execution messages to track state and latency figures, show graphics for key figures (time to order live, time to market ack, time to fill etc). we also want to be able to investigate result via AI agent. mastra is probably overkill or wrong choice, I prefer lightwight framework like the one used in developer-cockpit. create a spec ticket to start over, I guess most of the existing stuff can be discarded

## Log

- 2026-11-08 created
- 2026-11-08 17:25 — autopilot on
- 2026-11-08 17:28 — proposal gate passed; awaiting human approval
- 2026-11-08 17:33 — proposal approved by Toni Badertscher
- 2026-11-08 17:33 — proposal → design
- 2026-11-08 17:36 — design → plan
- 2026-11-08 17:37 — plan → implement
- 2026-11-08 18:00 — blocked: T-1,T-2,T-5..T-20 done (all mission-control tests green except the AC-9 layout test). Waiting on: (1) maintainer adds to specs/config.json modules: "mission-control": { "cwd": "mission-control", "verify": ["npm run typecheck", "npm test"] } (agents may not edit it; T-3/T-4/verify depend on it); (2) peer session oms-40 releasing oms-knowledge-base/ and the compose stack after SPEC-0049's verify, for T-21 (e2e run) and T-22 (KB page, drafted). Unblock after (1); I coordinate (2) with oms-40.
- 2026-11-08 18:11 — unblocked → implement
- 2026-11-08 18:12 — blocked: Unblocked, but specs/config.json still has no modules entry for mission-control, so 'spec set SPEC-0055 modules mission-control,oms-knowledge-base' fails and verify would skip the module. Needed (maintainer only; agents may not edit gate config): add under modules: "mission-control": { "cwd": "mission-control", "verify": ["npm run typecheck", "npm test"] }. Everything else is done (22/23 incl. the live e2e run, all FILLED).
- 2026-11-08 18:16 — unblocked → implement
- 2026-11-08 18:16 — set modules = mission-control, oms-knowledge-base
- 2026-11-08 18:17 — verify run: pass
- 2026-11-08 21:50 — implement → verify
- 2026-11-08 21:51 — verify run: pass
- 2026-11-08 21:52 — verify → done
- 2026-11-08 21:53 — autopilot off
