---
type: Requirement
title: "Expose the reject reason"
description: "The reject reason is published on oms_orders and returned by the query API and the metamodel."
tags: [functional, order-rejection]
status: draft
id: "FR-012"
priority: "should"
implementation: "implemented"
capability: "/capabilities/order-rejection.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/mapper/OrderMessageMapper.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/MetamodelService.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/005-order-reject-reason.yaml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/MetamodelServiceTest.java"
---
# Expose the reject reason

Introduced by SPEC-0003: `rejectReason` is stored on the order, mapped onto `OrderMessage` and
listed in the order metamodel so the UI can show it.

Capability: [order-rejection](../capabilities/order-rejection.md).
