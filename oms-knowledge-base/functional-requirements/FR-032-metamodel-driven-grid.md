---
type: Requirement
title: "Build columns and filters from the metamodel"
description: "Grid columns and filter editors are derived from the oms-core metamodel rather than hard-coded."
tags: [functional, admin-ui]
status: draft
id: "FR-032"
priority: "should"
implementation: "implemented"
capability: "/capabilities/admin-ui.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-ui/frontend/src/services/MetamodelService.ts"
  - resource: "repo:oms-ui/frontend/src/services/filterUtils.ts"
  - resource: "repo:oms-ui/frontend/src/services/MetamodelService.test.ts"
  - resource: "repo:oms-ui/frontend/src/services/filterUtils.test.ts"
---
# Build columns and filters from the metamodel

Uses `/api/v1/metamodel` ([REST Read API](../interfaces/rest-read-api.md)).

Capability: [admin-ui](../capabilities/admin-ui.md).
