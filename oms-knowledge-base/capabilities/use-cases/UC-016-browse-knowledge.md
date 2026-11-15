---
type: Use Case
title: "Browse the knowledge base and capability catalogue"
description: "A person reads the knowledge base and the capability catalogue in a UI rather than through an assistant."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-016"
actors: [/capabilities/actors/developer.md]
capability: "/capabilities/knowledge-services.md"
---
# UC-016 Browse the knowledge base and capability catalogue

A person reads the knowledge base and the capability catalogue in a UI rather than through an assistant.

Capability: [knowledge-services](../knowledge-services.md). Actors: [Developer](../actors/developer.md).

## Preconditions

- The KB explorer or the developer cockpit runs.

## Main Flow

1. In the KB explorer, the person browses by type or folder, filtered by status and trust, and follows links.
2. In the developer cockpit, the person opens Requirements: capabilities with maturity, their use cases, requirements and actors.

## Alternative Flows

- The knowledge server is down: the KB explorer shows nothing; the cockpit still reads the files.

## Postconditions

- The person knows what the OMS does and what is built.

## Requirements

- [FR-035](../functional-requirements/FR-035-browse-knowledge-base.md)
- [FR-046](../functional-requirements/FR-046-okf-aware-kb-explorer.md)
- [FR-048](../functional-requirements/FR-048-browse-capability-catalogue.md)
