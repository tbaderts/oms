---
id: see-fill-on-blotter
title: The fill shows up on the trade blotter
kind: system
from: oms-core
to: blotter
illustrations:
  - src: see-fill-on-blotter.excalidraw.svg
    caption: The streaming service pushes the filled ACME order to the trader's blotter
links:
  events: [OrderMessage, Execution]
  requirements: [FR-014, FR-025, FR-026, FR-031]
in:
  - name: Execution
    origin: { kind: step, ref: fill-arrives }
  - name: Filled order
    origin: { kind: step, ref: fill-arrives }
out:
  - name: Blotter row
    shape: "{ symbol: ACME, side: BUY, qty: 100, avgPx: 42.49, state: FILLED }"
    final: true
---

## What happens

The OMS publishes the filled order on `oms_orders` and each execution on `oms_executions`. The
streaming service picks them up and pushes them to the trade blotter, where the trader sees the ACME
order turn FILLED, with its average price, without refreshing the screen.

## Business rules

- The blotter first loads a snapshot of the orders and then applies every change as it arrives.
- The blotter shows each order once, in its latest state.

## Notes

- The blotter can filter what it streams, for example to one trader's orders.
