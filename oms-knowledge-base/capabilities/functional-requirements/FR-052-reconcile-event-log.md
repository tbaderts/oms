---
type: Requirement
title: "Reconcile orders with their event log"
description: "A scheduled job compares a sample of orders with the latest snapshot in their event log, checks the log has no gaps, and reports any order whose state the log does not explain."
tags: [functional]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-052"
priority: "should"
implementation: "implemented"
capability: "/capabilities/event-sourcing-and-replay.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/reconciliation/EventLogReconciler.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventLogReconcilerIntegrationTest.java"
---
# FR-052 Reconcile orders with their event log

A scheduled job compares a sample of orders with the latest snapshot in their event log, checks the log has no gaps, and reports any order whose state the log does not explain.

`EventLogReconciler` detects a change made without an event (a breach of policy P-05) in production rather than only in tests (SPEC-0049).

Capability: [event-sourcing-and-replay](../event-sourcing-and-replay.md).
