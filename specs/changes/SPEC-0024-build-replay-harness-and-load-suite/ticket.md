---
id: SPEC-0024
title: Build replay harness and load suite
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-core, oms-exchange-simulator, oms-knowledge-base]
approvals: []
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
