---
type: Capability
title: "Admin UI"
description: "The React admin tool and trade blotter for viewing and managing orders, executions, quotes and quote requests."
tags: [ui, react, blotter]
status: draft
maturity: "implemented"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-ui/frontend/src/App.tsx"
  - resource: "repo:oms-ui/frontend/src/services/OMSApiService.ts"
---
# Admin UI

## Summary

Operators and traders see orders and executions in real time and can send commands from the UI.

## Actors

Traders, operations.

## Behaviour

React with AG Grid; data from the [Query API](../interfaces/query-api.md), [REST Read API](../interfaces/rest-read-api.md) and the [streaming service](real-time-streaming.md). Component: [OMS UI](../architecture/oms-ui.md).

## Requirements

- [FR-031 Show a live blotter](../functional-requirements/FR-031-live-blotter.md)
- [FR-032 Build columns and filters from the metamodel](../functional-requirements/FR-032-metamodel-driven-grid.md)

## Detailed specifications

- [User Interface Specification: OMS Admin Tool](../ui/oms-admin-ui_spec.md)
- [Order State Indicator](../illustrations/order-state-indicator-spec.md)

## Known gaps

- Quotes and quote requests appear in the UI specification but have no backend ([Quotes](quotes.md)).

## Verification

`RSocketStreamingService.test.ts`, `BlotterStateService.test.ts`, `MetamodelService.test.ts`, `filterUtils.test.ts`, `OMSApiService.test.ts`, `DetailPanel.test.tsx`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
