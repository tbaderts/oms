---
type: Requirement
title: "Describe entities for the UI"
description: "The metamodel endpoint lists each entity's fields, types and available operations so clients can build columns and filters."
tags: [functional, order-query]
status: draft
id: "FR-019"
priority: "should"
implementation: "implemented"
capability: "/capabilities/order-query.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/MetamodelController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/MetamodelService.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/MetamodelServiceTest.java"
---
# Describe entities for the UI

Served by `/api/v1/metamodel` ([REST Read API](../interfaces/rest-read-api.md)); used by the [Admin UI](../capabilities/admin-ui.md).

Capability: [order-query](../capabilities/order-query.md).
