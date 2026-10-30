---
type: Requirement
title: "Serve OKF metadata and links to AI agents"
description: "The knowledge tools expose each concept's type, status, tags, trust tier and staleness, filter search by them, and list a concept's links and backlinks."
tags: [functional, knowledge-services]
status: draft
id: "FR-045"
priority: "should"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/docs/FrontMatter.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/docs/OkfMetadata.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/docs/ConceptLinks.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/kb/KnowledgeBaseTools.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/index/KnowledgeIndexService.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/docs/OkfMetadataTest.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/kb/KnowledgeBaseToolsTest.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/index/KnowledgeIndexServiceTest.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/docs/ConceptLinksTest.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/kbexplorer/KbExplorerControllerTest.java"
---
# Serve OKF metadata and links to AI agents

Built in SPEC-0011:
- front matter is parsed (SnakeYAML, safe constructor) and never indexed as text; title, description and tags are searchable;
- `searchKnowledgeBase` filters by `type`, `tag` and `status` (legacy Active/Complete/Draft mapped) and shows type, status and trust tier per hit;
- `readKnowledgeBase` starts with a metadata summary and ends with outgoing links (broken ones marked) and "cited by";
- `getKnowledgeBaseOverview` lists concepts only (no `index.md`/`log.md`), with type, status, trust and staleness;
- `GET /api/kb/documents` returns the metadata as an `okf` object for the KB explorer.

Capability: [knowledge-services](../capabilities/knowledge-services.md).
