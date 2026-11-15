---
id: SPEC-0061
title: Reorganize knowledge base and capability catalogue
type: refactor
status: done
awaiting:
autopilot: false
modules: [oms-knowledge-base, developer-cockpit, oms-mcp-server, oms-kb-explorer]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-14
blocked_from:
blocked_reason:
---

# SPEC-0061 — Reorganize knowledge base and capability catalogue

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

I would like to reorganize the knowledge base and create a more logical structure and review documents so that we don't have any misleading, oudated documents. also, we need to review how we organize capabilities (use cases / requirements), make sure they are complete and up to date, while also keeping in mind that we have developer cockpit for interacting with them. here's some idea for knowledge base structure, but also feel free to suggest other ways of improvement. the goal is to make it more organize and user friendly, while also making sure that it works well for agents retrieving knowledge via mcp.

## Log

- 2026-11-14 created
- 2026-11-14 05:38 — autopilot on
- 2026-11-14 05:42 — set modules = oms-knowledge-base, developer-cockpit, oms-mcp-server, oms-kb-explorer
- 2026-11-14 05:42 — proposal gate passed; awaiting human approval
- 2026-11-14 05:43 — proposal approved by Toni Badertscher
- 2026-11-14 05:43 — proposal → design
- 2026-11-14 05:47 — design → plan
- 2026-11-14 05:48 — plan → implement
- 2026-11-14 06:57 — blocked: Needs a human edit of specs/policies/architecture-policies.md (agents may not edit policies). AC-10 (check-kb-refs exits 0) fails only on two lines there that name the removed oms-framework/ folder: line 103 'review against `oms-framework/state-machine-framework_spec.md` and `task-orchestration-framework_spec.md`' -> 'review against `oms-knowledge-base/framework/state-machine.md` and `task-orchestrator.md`'; line 124 '`oms-framework/validation-rules.md` and `error-handling.md`' -> '`oms-knowledge-base/framework/validation-engine.md` and `exception-handling.md`'. Everything else is implemented and checked (17/21 tasks; T-18 to T-20 wait on this edit, T-21 is spec verify). After editing, run: node specs/tools/spec.mjs unblock SPEC-0061
- 2026-11-14 08:57 — unblocked → implement
- 2026-11-14 11:02 — verify run: fail
- 2026-11-14 11:02 — blocked: spec verify fails only on four developer-cockpit tests that already fail at the base commit 33f4e20 (proven on a clean worktree, see tasks.md notes); every SPEC-0061 check passes. Failing: (1) ApiCatalogService expects command API 3.2.0, contract is 3.4.0 since ad1ddd3 (stale assertion); (2) expandRoots and (3) StoryboardService use 'C:\...' as a 'foreign-platform' path, which resolves on Windows (tests assume POSIX); (4) strict storyboard corpus check: place-and-fill-order evidence card pinned at 09bd78e, cited code changed in e918878/6bd232a/ad1ddd3, needs a re-pin after review. Decide: (a) let me fix all four in this ticket (update the version assertion, use a path that is foreign on every platform, review and re-pin the card), or (b) fix them in a separate ticket and accept this verify result. Then run: node specs/tools/spec.mjs unblock SPEC-0061 (with a note saying a or b).
- 2026-11-14 11:16 — unblocked → implement
- 2026-11-14 11:21 — verify run: pass
- 2026-11-14 11:21 — implement → verify
- 2026-11-14 11:29 — reopened at implement: spec-reviewer: goal gap. Live pages still wrong or incomplete (schema-version rule only in archive, target-architecture status table stale, ci-cd verify claim, agent profile file names, README/ARCHITECTURE-REVIEW Qdrant, embedding model name, debt items), check-kb-refs misses old file names and oms-core/docs paths, missing duplicate-UC fixture, dispatch extractor ignores CommandDispatcher.
- 2026-11-14 11:37 — verify run: pass
- 2026-11-14 11:37 — implement → verify
- 2026-11-14 11:40 — verify run: pass
- 2026-11-14 11:41 — verify → done
- 2026-11-14 11:41 — autopilot off
