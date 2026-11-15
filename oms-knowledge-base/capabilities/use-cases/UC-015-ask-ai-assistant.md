---
type: Use Case
title: "Ask an AI assistant about the OMS"
description: "A developer asks an AI assistant a question; the assistant answers from the knowledge base and live order data through MCP."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-015"
actors: [/capabilities/actors/ai-agent.md, /capabilities/actors/developer.md]
capability: "/capabilities/knowledge-services.md"
---
# UC-015 Ask an AI assistant about the OMS

A developer asks an AI assistant a question; the assistant answers from the knowledge base and live order data through MCP.

Capability: [knowledge-services](../knowledge-services.md). Actors: [AI Agent](../actors/ai-agent.md), [Developer](../actors/developer.md).

## Preconditions

- The knowledge server runs and is registered with the assistant.

## Main Flow

1. The assistant reads the knowledge base overview, then searches it (filtered by type, section or status).
2. It reads the cited sections, following links and "cited by".
3. It searches orders when the question is about live data.

## Alternative Flows

- The assistant asks for a path that has moved: the server answers with the current document and says so.
- Ollama is down: search falls back to keywords.

## Postconditions

- The developer has an answer with citations.

## Requirements

- [FR-033](../functional-requirements/FR-033-serve-knowledge-base.md)
- [FR-034](../functional-requirements/FR-034-search-orders-for-agents.md)
- [FR-045](../functional-requirements/FR-045-okf-aware-knowledge-tools.md)
- [FR-047](../functional-requirements/FR-047-resolve-moved-knowledge-documents.md)
- [NFR-009](../non-functional-requirements/NFR-009-knowledge-retrieval-quality.md)
