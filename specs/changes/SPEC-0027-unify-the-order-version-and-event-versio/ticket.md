---
id: SPEC-0027
title: Unify the order version and event version
type: refactor
status: done
awaiting:
autopilot: false
modules: [oms-core, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0027 — Unify the order version and event version

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Address finding 6 of the architecture review (oms-core/docs/architecture-review-2026-10-30.md): txNr from JPA versioning and the event version from a max-plus-one query are two parallel sequences that mean almost the same thing. Make the event version the version of the order: the appender sets it on the entity before the save, the @Version column is that number, and the extra query per event goes away.

## Log

- 2026-10-30 created
- 2026-11-02 06:56 — autopilot on
- 2026-11-02 06:58 — proposal gate passed; awaiting human approval
- 2026-11-02 07:05 — proposal approved by Toni Badertscher
- 2026-11-02 07:05 — proposal → design
- 2026-11-02 07:06 — design → plan
- 2026-11-02 07:07 — plan → implement
- 2026-11-02 07:22 — verify run: fail
- 2026-11-02 07:26 — verify run: fail
- 2026-11-02 07:29 — verify run: pass
- 2026-11-02 07:29 — implement → verify
- 2026-11-02 07:36 — reopened at implement: Review: lock-contention losers (deadlock/CannotAcquireLock between a lifecycle row lock and a fill) come back as refusals because only OptimisticLockingFailureException is rethrown; AC-3 needs real two-fill and Kafka-retry tests; doc and migration gaps
- 2026-11-02 07:42 — verify run: pass
- 2026-11-02 07:43 — implement → verify
- 2026-11-02 07:44 — verify → done
- 2026-11-02 07:44 — autopilot off
