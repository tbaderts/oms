---
aliases: [functional-requirements/FR-027-decide-venue-outcome]
type: Requirement
title: "Decide the venue outcome of an order"
description: "The simulator prices each symbol from the price service or its static prices, rejects unknown symbols, sub-penny limits and limits through the price collar, fills marketable quantity at the reference price and rests the rest."
tags: [functional, exchange-simulation]
status: draft
updated: "2026-11-26T15:00:00Z"
id: "FR-027"
priority: "must"
implementation: "implemented"
capability: "/capabilities/exchange-simulation.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/engine/OrderEvaluator.java"
  - resource: "repo:oms-exchange-simulator/src/test/java/org/example/simulator/engine/OrderEvaluatorTest.java"
---
# Decide the venue outcome of an order

MARKET orders are always marketable; a LIMIT buy is marketable at or above the reference price, a sell at or below it.

Capability: [exchange-simulation](../exchange-simulation.md).
