---
aliases: [architecture/oms-ui]
type: Component
title: "OMS UI"
description: "React admin tool and trade blotter."
tags: [component, react, ui]
status: draft
updated: "2026-11-26T15:00:00Z"
component: "oms-ui"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-ui/frontend/src/App.tsx"
  - resource: "repo:oms-ui/frontend/package.json"
---
# OMS UI

React, TypeScript, AG Grid, Tailwind. Capability: [Admin UI](../../capabilities/admin-ui.md). Specifications:
[Admin UI](../../ui/admin-ui.md), [Design System](../../ui/design-system.md).

Context: [System Context](system-context.md).

Its Spring Boot backend serves the frontend and the [Market Data API](../../domain/interfaces/market-data-api.md)
for [Order Entry](../../ui/order-entry.md). It forwards those requests to the
[Price Service](price-service.md), which holds the market data key (SPEC-0079). oms-ui itself has
no provider and no key.
