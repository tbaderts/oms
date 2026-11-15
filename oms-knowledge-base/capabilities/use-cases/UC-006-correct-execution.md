---
type: Use Case
title: "Correct an execution (planned)"
description: "An execution is busted or manually cancelled (whacked), and the order is put back as if it had not happened. The event log supports it; the commands have no handler yet (SPEC-0030)."
tags: [use-case, planned]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-006"
actors: [/capabilities/actors/operations-user.md, /capabilities/actors/venue.md]
capability: "/capabilities/execution-processing.md"
---
# UC-006 Correct an execution (planned)

An execution is busted or manually cancelled (whacked), and the order is put back as if it had not happened. The event log supports it; the commands have no handler yet (SPEC-0030).

Capability: [execution-processing](../execution-processing.md). Actors: [Operations User](../actors/operations-user.md), [Venue](../actors/venue.md).

## Preconditions

- The execution exists on the order.

## Main Flow

1. The venue or an operations user sends `ExecutionBustCmd` or `ExecutionWhackCmd`.
2. The OMS marks the execution busted or whacked, reverses its quantities and, if needed, moves a FILLED order back to LIVE.
3. The change is recorded as `EXEC_BUST` or `EXEC_WHACK` and published.

## Alternative Flows

- The execution is unknown or already reversed: the command is refused.

## Postconditions

- The order quantities no longer include the execution.

## Requirements

- [FR-015](../functional-requirements/FR-015-bust-executions.md)
- [FR-016](../functional-requirements/FR-016-whack-executions.md)
