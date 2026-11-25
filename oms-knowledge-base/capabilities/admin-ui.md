---
type: Capability
title: "Admin UI"
description: "The React admin tool and trade blotter for viewing and managing orders, executions, quotes and quote requests."
tags: [ui, react, blotter]
status: draft
updated: "2026-11-25T09:00:00Z"
maturity: "implemented"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-ui/frontend/src/App.tsx"
  - resource: "repo:oms-ui/frontend/src/services/OMSApiService.ts"
---
# Admin UI

## Summary

Operators and traders see orders and executions in real time (Live) or page through them
(History) and can send commands from the UI. Numbers are aligned and formatted, FIX codes are
named, ids stay readable, and the blotters work from the keyboard (SPEC-0059; see
[Formatting, Toolbar and Keyboard](../ui/admin-ui.md#formatting-toolbar-and-keyboard-spec-0059)).

An order's detail also shows its command and event history, read from the event log and command
log. Refused commands are included, and the JSON content is rendered readably (SPEC-0074; see
[Order History](../ui/admin-ui.md#8-order-history-orderhistorytsx-spec-0074)).

## Actors

Traders, operations.

## Behaviour

React with AG Grid; data from the [Query API](../domain/interfaces/query-api.md), [REST Read API](../domain/interfaces/rest-read-api.md) and the [streaming service](real-time-streaming.md). Component: [OMS UI](../architecture/context/oms-ui.md).

## Use cases

- [UC-011 Work orders in the admin UI](use-cases/UC-011-work-in-admin-ui.md)

## Requirements

- [FR-031 Show a live blotter](functional-requirements/FR-031-live-blotter.md)
- [FR-032 Build columns and filters from the metamodel](functional-requirements/FR-032-metamodel-driven-grid.md)

## Detailed specifications

- [User Interface Specification: OMS Admin Tool](../ui/admin-ui.md)
- [Order State Indicator](../ui/order-state-indicator.md)
- [Design System](../ui/design-system.md) — tokens, AG Grid theme and the tests that enforce them

## Known gaps

- Quotes and quote requests appear in the UI specification but have no backend ([Quotes](quotes.md)).

## Verification

`RSocketStreamingService.test.ts`, `BlotterStateService.test.ts`, `MetamodelService.test.ts`, `filterUtils.test.ts`, `OMSApiService.test.ts`, `DetailPanel.test.tsx`, `DetailModal.test.tsx`, `OrderHistory.test.tsx`, `orderHistory.test.ts`, `JsonTree.test.tsx`. Conventions: [Testing Patterns](../delivery/testing.md).
