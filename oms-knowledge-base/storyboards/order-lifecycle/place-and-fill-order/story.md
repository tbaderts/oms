---
id: place-and-fill-order
title: Place and fill a client order
domain: order-lifecycle
status: draft
owner: oms-team
tags: [order-lifecycle, exchange-simulator, blotter]
lanes:
  - { id: trader, label: Trader, kind: actor }
  - { id: oms-core, label: OMS, kind: system }
  - { id: exchange, label: Exchange simulator, kind: external }
  - { id: blotter, label: Trade blotter, kind: channel }
steps:
  - submit-order
  - publish-order
  - venue-accepts
  - fill-arrives
  - see-fill-on-blotter
---

## Summary

A trader submits a new order to the OMS, the OMS publishes it to the venue, the exchange simulator
accepts and fills it, and the filled order appears on the trade blotter. The worked example
throughout: **BUY 100 ACME at a limit of 42.50**, filled in three slices (40 @ 42.48, 35 @ 42.50,
25 @ 42.49), average price 42.49.

## Scope and assumptions

- The venue is the exchange simulator (`oms-exchange-simulator`); there is no real market
  connectivity.
- The order is submitted through the command API, for example from the cockpit's API Explorer.
- Cancels, replaces and busted executions are separate journeys.
