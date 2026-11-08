---
type: Requirement
title: "Manually cancel (whack) executions"
description: "An ExecutionWhackCmd lets an operator cancel an execution manually."
tags: [functional, execution-processing]
status: draft
id: "FR-016"
priority: "could"
implementation: "not-implemented"
capability: "/capabilities/execution-processing.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/avro/ExecutionWhackCmd.avsc"
  - resource: "/oms-concepts/execution-reporting.md"
---
# Manually cancel (whack) executions

Specified in [Execution Reporting](../oms-concepts/execution-reporting.md) (whack). Schema only.

Capability: [execution-processing](../capabilities/execution-processing.md).

Recording side built in SPEC-0044: the `EXEC_WHACK` event with `exec_id`, the execution status (`BUSTED`), and the `OrderExecution` record with ExecType `H` on `oms_order_executions`, through `OrderEventAppender.appendExecutionLifecycleEvent`. Command processing remains not implemented (SPEC-0030).
