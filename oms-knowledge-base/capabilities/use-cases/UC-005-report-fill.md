---
type: Use Case
title: "Report a fill"
description: "The venue reports an execution; the OMS applies it to the order and publishes it with the order as of the fill."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-005"
actors: [/capabilities/actors/venue.md]
capability: "/capabilities/execution-processing.md"
---
# UC-005 Report a fill

The venue reports an execution; the OMS applies it to the order and publishes it with the order as of the fill.

Capability: [execution-processing](../execution-processing.md). Actors: [Venue](../actors/venue.md).

## Preconditions

- The order is LIVE.

## Main Flow

1. The venue sends `ExecutionCreateCmd` with `execId`, quantity and price.
2. The OMS checks the fill (order LIVE, no over-fill), stores the execution and updates `cumQty`, `leavesQty` and the average price.
3. When `leavesQty` reaches 0 the order becomes FILLED; otherwise it stays LIVE.
4. The fill, the order change and the projection row are stored in one transaction and published on `oms_executions` and `oms_order_executions`.

## Alternative Flows

- The same `execId` arrives again for the order: the fill is refused as a duplicate.
- The fill would exceed the order quantity: it is refused.

## Postconditions

- The order and the execution reflect the fill; consumers receive it with the order as of the fill.

## Requirements

- [FR-013](../functional-requirements/FR-013-apply-fills.md)
- [FR-014](../functional-requirements/FR-014-publish-fills.md)
- [FR-017](../functional-requirements/FR-017-reject-duplicate-execution.md)
