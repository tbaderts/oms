---
id: SPEC-0034
title: Require sessionId in the order create contract
type: fix
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-31
blocked_from:
blocked_reason:
---

# SPEC-0034 — Require sessionId in the order create contract

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Align the contract with oms-core: oms-core requires order.sessionId for OrderCreateCmd, but oms-cmd-api.yml does not list it as required. Mark it required in the contract (the recommended contract alignment, SPEC-0007 follow-up 1) and plan a fix for anything that breaks.

## Log

- 2026-10-31 created
- 2026-10-31 06:46 — autopilot on
- 2026-10-31 06:48 — set modules = oms-contracts, oms-core, developer-cockpit
- 2026-10-31 06:48 — proposal gate passed; awaiting human approval
- 2026-10-31 06:49 — proposal approved by Toni Badertscher
- 2026-10-31 06:49 — proposal → design
- 2026-10-31 06:52 — design → plan
- 2026-10-31 06:52 — plan → implement
- 2026-10-31 07:02 — verify run: fail
- 2026-10-31 07:06 — verify run: fail
- 2026-10-31 07:06 — blocked: T-10: spec verify fails only on QuerySearchIsolationIntegrationTest#search_readsOrdersAndVersionsUnderRepeatableRead, which SPEC-0018 wrote red on purpose (its T-14, ticket blocked). oms-core 190/191 pass; every other module passes, cockpit 483/483. Not caused by SPEC-0034 (query isolation, no command code). Unblock: finish SPEC-0018 T-14, or move the test aside while verifying, then re-run spec verify.
- 2026-10-31 07:06 — autopilot off
- 2026-10-31 07:39 — Block cause resolved: SPEC-0018 is done (T-14 finished); QuerySearchIsolationIntegrationTest passes in SPEC-0018's final verify (oms-core 191/191). Unblocked by the agent at the start of /spec-run SPEC-0034 requested by the user.
- 2026-10-31 07:39 — unblocked → implement
- 2026-10-31 07:39 — autopilot on
- 2026-10-31 07:40 — verify run: pass
- 2026-10-31 07:40 — implement → verify
- 2026-10-31 07:43 — reopened at implement: Review: the contract's own executeCommand request example in oms-cmd-api.yml is an OrderCreateCmd without sessionId (and with non-Order fields), so the contract documents a body its schema rejects; the proposal's scope promised to fix every OrderCreateCmd example. Also the storyboard submit-order step's shape omits sessionId.
- 2026-10-31 07:47 — verify run: pass
- 2026-10-31 07:47 — implement → verify
- 2026-10-31 07:48 — verify → done
- 2026-10-31 07:48 — autopilot off
