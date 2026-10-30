---
type: Requirement
title: "Knowledge retrieval quality"
description: "Knowledge base search returns the right document among the top results for the evaluation queries."
tags: [non-functional, quality]
status: draft
id: "NFR-009"
priority: "should"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
category: "quality"
metric: "Document recall@5 over the retrieval evaluation queries"
target: "≥ 0.90"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/index/KnowledgeIndexService.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/index/RetrievalEvalTest.java"
---
# Knowledge retrieval quality

| Category | Metric | Target |
|---|---|---|
| quality | Document recall@5 over the retrieval evaluation queries | ≥ 0.90 |

`RetrievalEvalTest` indexes the real knowledge base and fails below the pinned baseline (0.90).

Capability: [knowledge-services](../capabilities/knowledge-services.md).
