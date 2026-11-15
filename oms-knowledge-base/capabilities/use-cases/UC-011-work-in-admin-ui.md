---
type: Use Case
title: "Work orders in the admin UI"
description: "A user views and manages orders and executions in the web UI."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-011"
actors: [/capabilities/actors/trader.md, /capabilities/actors/operations-user.md]
capability: "/capabilities/admin-ui.md"
---
# UC-011 Work orders in the admin UI

A user views and manages orders and executions in the web UI.

Capability: [admin-ui](../admin-ui.md). Actors: [Trader](../actors/trader.md), [Operations User](../actors/operations-user.md).

## Preconditions

- The UI can reach oms-core and the streaming service.

## Main Flow

1. The user opens the order or execution blotter, live or paged.
2. Columns and filters come from the metamodel.
3. The user opens an order's details and sends commands through the command API.

## Alternative Flows

- Without a token, authenticated requests fail; the user sets one.

## Postconditions

- The user has seen and acted on the orders.

## Requirements

- [FR-031](../functional-requirements/FR-031-live-blotter.md)
- [FR-032](../functional-requirements/FR-032-metamodel-driven-grid.md)
