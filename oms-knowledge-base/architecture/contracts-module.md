---
type: Decision
title: "Decision: One Contracts Module"
description: "All OpenAPI and Avro contracts live in oms-contracts and nowhere else."
tags: [decision, contracts, spec-first]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/build.gradle"
  - resource: "repo:specs/policies/architecture-policies.md"
---
# Decision: One Contracts Module

## Context
Schemas edited in more than one place produce messages consumers cannot read.

## Decision
`oms-contracts` holds the only copy; services consume its generated models; its build fails if a
service grows its own contract folder (policies P-01 – P-04).

## Consequences
Contract changes start in one place and are verified against every consumer.

Component: [oms-contracts](oms-contracts.md).

Context: [System Context](system-context.md).
