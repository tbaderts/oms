---
aliases: [non-functional-requirements/NFR-010-contract-compatibility]
type: Requirement
title: "Backward-compatible contracts"
description: "Avro schemas and OpenAPI contracts change only in backward-compatible ways unless a breaking change is versioned and announced."
tags: [non-functional, compatibility]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "NFR-010"
priority: "must"
implementation: "partial"
capability: "/capabilities/event-publication.md"
category: "compatibility"
metric: "Breaking contract changes released unannounced"
target: "0"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/avro/OrderMessage.avsc"
  - resource: "repo:oms-contracts/src/test/java/org/example/common/contracts/CommandCompatibilityTest.java"
  - resource: "repo:oms-contracts/src/test/java/org/example/common/contracts/OrderMessageCompatibilityTest.java"
  - resource: "repo:specs/policies/architecture-policies.md"
---
# Backward-compatible contracts

| Category | Metric | Target |
|---|---|---|
| compatibility | Breaking contract changes released unannounced | 0 |

Governed by policy P-04. **Partial**: the Avro side is checked automatically. Every command record and
the three published messages (`OrderMessage`, `Execution`, `OrderExecution`) are compared with a frozen
copy of their released schema in `oms-contracts/src/test/resources/compat/` by
`CommandCompatibilityTest`, `OrderMessageCompatibilityTest`, `ExecutionCompatibilityTest` and
`OrderExecutionCompatibilityTest` on every `./gradlew build` of oms-contracts. The OpenAPI contracts have
no such check.

Capability: [event-publication](../event-publication.md).
