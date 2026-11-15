---
aliases: [architecture/task-pipeline-and-state-machine]
type: Decision
id: "ADR-004"
title: "Decision: Task Pipelines and a State Machine"
description: "Every command runs as an ordered task pipeline, and state changes are validated by one state machine."
tags: [decision, task-orchestration, state-machine]
status: draft
updated: "2026-11-14T12:00:00Z"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/common/orchestration/TaskOrchestrator.java"
  - resource: "repo:oms-core/src/main/java/org/example/common/state/OrderStateMachineConfig.java"
  - resource: "repo:specs/policies/architecture-policies.md"
---
# Decision: Task Pipelines and a State Machine

## Context
Illegal transitions and skipped validation are the costliest OMS defects.

## Decision
Command processors compose small tasks (validate → set state → persist → publish) run by the
[task orchestration framework](../../framework/task-orchestrator.md); transitions are
checked by the [state machine](../../framework/state-machine.md) (policy P-10).

## Consequences
Rules are testable task by task; new commands follow the same shape (see
[Order Capture](../../capabilities/order-capture.md)).

Context: [System Context](../context/system-context.md).
