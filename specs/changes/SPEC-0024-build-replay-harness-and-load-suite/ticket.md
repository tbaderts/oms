---
id: SPEC-0024
title: Build replay harness and load suite
type: feature
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

# SPEC-0024 — Build replay harness and load suite

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Roadmap ticket G of the architecture review (oms-core/docs/architecture-review-2026-10-30.md, findings 13 and 8): build a replay runner that feeds the commands stored in order_events.transaction in id order into a fresh database and diffs the resulting snapshots against the stored ones, so reproducing behaviour becomes a test; reuse it with the exchange simulator as a load suite that records throughput and the SLA percentiles as a baseline before the projection and tree work; add a schema_version to stored events, keep golden-file fixtures of old events in the test suite and write down the upcasting rule.

## Log

- 2026-10-30 created
- 2026-11-08 07:20 — autopilot on
- 2026-11-08 07:22 — proposal gate passed; awaiting human approval
- 2026-11-08 07:23 — proposal approved by Toni Badertscher
- 2026-11-08 07:23 — proposal → design
- 2026-11-08 07:24 — set modules = oms-core, oms-knowledge-base
- 2026-11-08 07:24 — design → plan
- 2026-11-08 07:25 — plan → implement
- 2026-11-08 07:49 — autopilot on
- 2026-11-08 10:17 — autopilot on
- 2026-11-08 10:44 — verify run: pass
- 2026-11-08 10:44 — implement → verify
- 2026-11-08 10:48 — reopened at implement: Independent review finding 1 (major): the golden-fixture test does not detect fields the current model drops; the execution fixture holds 8 fields cmd.Execution never had. Fix: round-trip assertion that every fixture field survives decode, fixtures made faithful.
- 2026-11-08 10:50 — implement → verify
- 2026-11-08 10:55 — verify run: pass
- 2026-11-08 10:56 — verify → done
- 2026-11-08 10:56 — autopilot off
