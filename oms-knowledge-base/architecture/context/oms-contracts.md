---
aliases: [architecture/oms-contracts]
type: Component
title: "oms-contracts"
description: "Library holding the only copy of the OpenAPI and Avro contracts and the models generated from them."
tags: [component, contracts, library]
status: draft
updated: "2026-11-14T12:00:00Z"
component: "oms-contracts"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/build.gradle"
  - resource: "repo:oms-contracts/src/main/openapi/oms-cmd-api.yml"
---
# oms-contracts

Every service includes it in its composite build. See [Contracts Module](../decisions/ADR-001-contracts-module.md),
[Message API](../../domain/interfaces/message-api.md), [OpenAPI Contracts](../patterns/contract-first-codegen.md).

Context: [System Context](system-context.md).
