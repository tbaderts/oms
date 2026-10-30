---
type: Decision
title: "Decision: Task Pipelines and a State Machine"
description: "Every command runs as an ordered task pipeline, and state changes are validated by one state machine."
tags: [decision, task-orchestration, state-machine]
status: draft
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
[task orchestration framework](../oms-framework/task-orchestration-framework_spec.md); transitions are
checked by the [state machine](../oms-framework/state-machine-framework_spec.md) (policy P-10).

## Consequences
Rules are testable task by task; new commands follow the same shape (see
[Order Capture](../capabilities/order-capture.md)).

Context: [System Context](system-context.md).
