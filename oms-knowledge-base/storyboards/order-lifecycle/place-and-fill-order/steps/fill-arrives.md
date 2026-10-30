---
id: fill-arrives
title: Fills arrive from the venue
kind: external
from: exchange
to: oms-core
illustrations:
  - src: fill-arrives.excalidraw.svg
    caption: Three fills (40, 35 and 25 shares) complete the order, which becomes FILLED
links:
  api: [oms-cmd-api#ExecutionCreateCmd]
  events: [Execution]
  states: ["LIVE -> FILLED"]
  requirements: [FR-013, FR-017, FR-028]
in:
  - name: Live order
    origin: { kind: step, ref: venue-accepts }
out:
  - name: Execution
    shape: "{ execId, lastQty, lastPx }  e.g. 40 @ 42.48, 35 @ 42.50, 25 @ 42.49"
  - name: Filled order
    shape: "{ orderId, state: FILLED, cumQty: 100, leavesQty: 0, avgPx: 42.49 }"
extensions:
  - id: partial-fill
    when: A fill covers only part of the open quantity
    then: The order stays LIVE with less open quantity and waits for the next fill.
    continueAt: { kind: stay }
    illustrations:
      - src: fill-arrives-partial-fill.excalidraw.svg
        caption: After the first fill of 40, 60 shares are still open and the order stays LIVE
    out:
      - name: Partly filled order
        shape: "{ state: LIVE, cumQty: 40, leavesQty: 60 }"
        final: true
  - id: duplicate-execution
    when: The same execution (same execId) arrives a second time
    then: The OMS refuses it as a duplicate; the order's quantities do not change.
    continueAt: { kind: stay }
    illustrations:
      - src: fill-arrives-duplicate-execution.excalidraw.svg
        caption: A repeated execId E-77 is refused; quantities stay as they were
---

## What happens

The simulator executes the order in three slices: 40 shares at 42.48, 35 at 42.50 and 25 at 42.49.
Each slice arrives as an `ExecutionCreateCmd`. The OMS stores every execution and recalculates the
order: after the third fill all 100 shares are executed, nothing is open, and the order becomes
FILLED at an average price of 42.49.

## Business rules

- An execution id can be applied only once per order.
- Quantities follow from the fills: executed plus open always equals the order quantity.

## Notes

- Busted and corrected executions are handled by their own commands, outside this journey.
