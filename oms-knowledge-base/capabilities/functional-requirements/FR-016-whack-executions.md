---
aliases: [functional-requirements/FR-016-whack-executions]
type: Requirement
title: "Manually cancel (whack) executions"
description: "An ExecutionWhackCmd lets an operator cancel an execution manually."
tags: [functional, execution-processing]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-016"
priority: "could"
implementation: "not-implemented"
capability: "/capabilities/execution-processing.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/avro/ExecutionWhackCmd.avsc"
  - resource: "/domain/concepts/execution-reporting.md"
---
# Manually cancel (whack) executions

Specified in [Execution Reporting](../../domain/concepts/execution-reporting.md) (whack). Schema only.

Capability: [execution-processing](../execution-processing.md).

Recording side built in SPEC-0044: the `EXEC_WHACK` event with `exec_id`, the execution status (`BUSTED`), and the `OrderExecution` record with ExecType `H` on `oms_order_executions`, through `OrderEventAppender.appendExecutionLifecycleEvent`. Command processing remains not implemented (SPEC-0030).
