---
type: Requirement
title: "Backward-compatible contracts"
description: "Avro schemas and OpenAPI contracts change only in backward-compatible ways unless a breaking change is versioned and announced."
tags: [non-functional, compatibility]
status: draft
id: "NFR-010"
priority: "must"
implementation: "not-implemented"
capability: "/capabilities/event-publication.md"
category: "compatibility"
metric: "Breaking contract changes released unannounced"
target: "0"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:specs/policies/architecture-policies.md"
  - resource: "repo:oms-contracts/src/main/avro/OrderMessage.avsc"
---
# Backward-compatible contracts

| Category | Metric | Target |
|---|---|---|
| compatibility | Breaking contract changes released unannounced | 0 |

Governed by policy P-04 and checked by review and by the Schema Registry at runtime. Not implemented as an automated check: no build step compares schemas with the previous release.

Capability: [event-publication](../capabilities/event-publication.md).
