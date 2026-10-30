---
type: Capability
title: "Knowledge Services"
description: "Making the knowledge base and OMS data available to AI assistants (MCP) and to people (KB explorer)."
tags: [mcp, knowledge-base, ai-assisted-development]
status: draft
maturity: "implemented"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/kb/KnowledgeBaseTools.java"
  - resource: "repo:oms-kb-explorer/src/components/DocumentViewer.tsx"
---
# Knowledge Services

## Summary

AI agents query the knowledge base and live orders through the MCP server; people browse it in the KB explorer.

## Actors

Developers and AI assistants (Claude, Copilot).

## Behaviour

Components: [MCP Server](../architecture/mcp-server.md), [KB Explorer](../architecture/kb-explorer.md).

## Requirements

- [FR-033 Serve the knowledge base to AI agents](../functional-requirements/FR-033-serve-knowledge-base.md)
- [FR-045 Serve OKF metadata and links to AI agents](../functional-requirements/FR-045-okf-aware-knowledge-tools.md)
- [FR-034 Let AI agents search orders](../functional-requirements/FR-034-search-orders-for-agents.md)
- [FR-035 Browse the knowledge base in a web UI](../functional-requirements/FR-035-browse-knowledge-base.md)
- [FR-046 Browse the knowledge base by OKF type, metadata and links](../functional-requirements/FR-046-okf-aware-kb-explorer.md)
- [NFR-009 Knowledge retrieval quality](../non-functional-requirements/NFR-009-knowledge-retrieval-quality.md)

## Detailed specifications

- [AI-Augmented Development](../oms-methodolgy/ai-augmented-development.md)
- [OMS Knowledge Base Strategy](../oms-knowledge-base-strategy.md)
- [OMS Knowledge Base Review Report](../KNOWLEDGE-BASE-REVIEW-REPORT.md) (February 2026; partly outdated)
- [Knowledge Base Conventions](../okf-conventions.md)

## Known gaps

- The index is built at startup; changes to the knowledge base need a restart.
- The KB explorer has no link-graph visualisation (the links panel covers navigation), and its components are checked in the browser rather than by rendering tests.

## Verification

`KnowledgeBaseToolsTest`, `KnowledgeIndexServiceTest`, `OkfMetadataTest`, `ConceptLinksTest`, `KbExplorerControllerTest`, `OrderSearchMcpToolsTest`, `RetrievalEvalTest`, explorer `src/okf/*.test.ts`, `frontMatter.test.ts`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
