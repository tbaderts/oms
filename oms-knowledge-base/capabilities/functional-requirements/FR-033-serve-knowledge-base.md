---
aliases: [functional-requirements/FR-033-serve-knowledge-base]
type: Requirement
title: "Serve the knowledge base to AI agents"
description: "The knowledge server (kb-server) offers knowledge base search, section reads by anchor and an overview with metadata."
tags: [functional, knowledge-services]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-033"
priority: "should"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/kb/KnowledgeBaseTools.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/index/KnowledgeIndexService.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/test/java/io/kbserver/kb/KnowledgeBaseToolsTest.java"
---
# Serve the knowledge base to AI agents

Tools `searchKnowledgeBase`, `readKnowledgeBase`, `getKnowledgeBaseOverview`; hybrid keyword and semantic search with `path#anchor` citations. OKF metadata, filters and links: [FR-045](FR-045-okf-aware-knowledge-tools.md).

Served by [kb-server](../../tools/knowledge-server.md) from the knowledge-server repository, which can serve several named knowledge repositories (search can be limited to one); OMS configures it with `oms-knowledge-base`, so document paths keep that prefix (SPEC-0080).

Capability: [knowledge-services](../knowledge-services.md).
