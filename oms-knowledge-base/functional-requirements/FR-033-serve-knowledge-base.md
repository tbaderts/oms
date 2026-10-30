---
type: Requirement
title: "Serve the knowledge base to AI agents"
description: "The MCP server offers knowledge base search, section reads by anchor and an overview with metadata."
tags: [functional, knowledge-services]
status: draft
id: "FR-033"
priority: "should"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/kb/KnowledgeBaseTools.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/index/KnowledgeIndexService.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/kb/KnowledgeBaseToolsTest.java"
---
# Serve the knowledge base to AI agents

Tools `searchKnowledgeBase`, `readKnowledgeBase`, `getKnowledgeBaseOverview`; hybrid keyword and semantic search with `path#anchor` citations. OKF metadata, filters and links: [FR-045](FR-045-okf-aware-knowledge-tools.md).

Capability: [knowledge-services](../capabilities/knowledge-services.md).
