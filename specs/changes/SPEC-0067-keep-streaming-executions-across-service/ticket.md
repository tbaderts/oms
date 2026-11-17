---
id: SPEC-0067
title: Keep streaming executions across service restarts
type: fix
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-streaming-service, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-16
blocked_from:
blocked_reason:
---

# SPEC-0067 — Keep streaming executions across service restarts

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

oms-ui execution blotter: after restarting components, all the previous executions have disappeared, so I wonder if there is a bug

## Log

- 2026-11-16 created
- 2026-11-17 05:24 — autopilot on
- 2026-11-17 05:27 — set modules = oms-contracts, oms-core, oms-streaming-service, oms-knowledge-base
- 2026-11-17 05:27 — proposal gate passed; awaiting human approval
- 2026-11-17 05:27 — proposal approved by Toni Badertscher
- 2026-11-17 05:27 — proposal → design
- 2026-11-17 05:29 — design → plan
- 2026-11-17 05:29 — plan → implement
- 2026-11-17 06:32 — verify run: fail
- 2026-11-17 08:04 — verify run: fail
- 2026-11-17 10:16 — verify run: fail
- 2026-11-17 10:27 — verify run: fail
- 2026-11-17 10:28 — blocked: All tasks done except T-6 (spec verify); SPEC-0067's own tests pass (oms-core ExecutionViewQueryIntegrationTest 8/8, streaming 15/15 and 5/5; streaming, mcp-server, exchange-simulator, contracts checks green; review findings fixed). The oms-core gate fails only on SPEC-0052's uncommitted RetentionLeadershipIntegrationTest#onlyTheSchedulerLeaderArchives (AssertionError at line 62 in the full suite, passes alone; failed in 2 of 2 full runs). SPEC-0052 is in turn blocked waiting for SPEC-0067 to be committed. Unblock once one of the two is committed (stage SPEC-0067's files explicitly) or SPEC-0052's test is fixed; I then re-run spec verify, write verification.md and close.
- 2026-11-17 10:42 — verify run: pass
- 2026-11-17 10:45 — unblocked → implement
- 2026-11-17 10:45 — implement → verify
- 2026-11-17 10:45 — verify → done
- 2026-11-17 10:45 — autopilot off
