---
type: Requirement
title: "Split executions into several fills"
description: "A marketable quantity is split into positive slices that sum to the quantity."
tags: [functional, exchange-simulation]
status: draft
id: "FR-028"
priority: "should"
implementation: "implemented"
capability: "/capabilities/exchange-simulation.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/engine/FillSlicer.java"
  - resource: "repo:oms-exchange-simulator/src/test/java/org/example/simulator/engine/FillSlicerTest.java"
---
# Split executions into several fills

Fewer units than slices reduces the slice count; fractions go into the last slice.

Capability: [exchange-simulation](../capabilities/exchange-simulation.md).
