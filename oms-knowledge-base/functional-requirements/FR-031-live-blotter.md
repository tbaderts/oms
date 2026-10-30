---
type: Requirement
title: "Show a live blotter"
description: "The UI subscribes to the streaming service over RSocket and keeps the blotter rows in step with incoming orders and executions."
tags: [functional, admin-ui]
status: draft
id: "FR-031"
priority: "must"
implementation: "implemented"
capability: "/capabilities/admin-ui.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-ui/frontend/src/services/RSocketStreamingService.ts"
  - resource: "repo:oms-ui/frontend/src/services/BlotterStateService.ts"
  - resource: "repo:oms-ui/frontend/src/services/RSocketStreamingService.test.ts"
  - resource: "repo:oms-ui/frontend/src/services/BlotterStateService.test.ts"
---
# Show a live blotter

Grid preferences (columns, filters) are kept per domain object type in the browser's local storage.

Capability: [admin-ui](../capabilities/admin-ui.md).
