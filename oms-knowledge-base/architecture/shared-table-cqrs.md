---
type: Decision
title: "Decision: Shared-table CQRS"
description: "Commands and queries have separate APIs and models but read and write the same tables."
tags: [decision, cqrs]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/QueryController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/CommandController.java"
  - resource: "repo:specs/policies/architecture-policies.md"
---
# Decision: Shared-table CQRS

## Context
CQRS separates writes from reads; a separate read store adds replication and lag.

## Decision
Separate command and query APIs and models (policy P-09), one set of tables. A separate read store
is evaluated in [State-Query Store](../oms-framework/state-query-store_spec.md) but not built.

## Consequences
Reads are immediately consistent; scaling reads relies on database replicas.

Capability: [Order Query](../capabilities/order-query.md).

Context: [System Context](system-context.md).
