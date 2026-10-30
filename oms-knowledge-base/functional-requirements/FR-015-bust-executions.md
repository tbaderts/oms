---
type: Requirement
title: "Bust executions"
description: "An ExecutionBustCmd reverses a previously applied execution and restores the order quantities and state."
tags: [functional, execution-processing]
status: draft
id: "FR-015"
priority: "should"
implementation: "not-implemented"
capability: "/capabilities/execution-processing.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/avro/ExecutionBustCmd.avsc"
  - resource: "/oms-concepts/execution-reporting.md"
---
# Bust executions

Specified in [Execution Reporting](../oms-concepts/execution-reporting.md) (bust workflows). The command schema exists; no dispatcher handles it (the API answers 501).

Capability: [execution-processing](../capabilities/execution-processing.md).
