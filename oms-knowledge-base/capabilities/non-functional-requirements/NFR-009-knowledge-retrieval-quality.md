---
aliases: [non-functional-requirements/NFR-009-knowledge-retrieval-quality]
type: Requirement
title: "Knowledge retrieval quality"
description: "Knowledge base search returns the right document among the top results for the evaluation queries."
tags: [non-functional, quality]
status: draft
updated: "2026-11-28T12:00:00Z"
id: "NFR-009"
priority: "should"
implementation: "implemented"
capability: "/capabilities/knowledge-services.md"
category: "quality"
metric: "Document recall@5 over the retrieval evaluation queries"
target: "≥ 0.90"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/index/KnowledgeIndexService.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/test/java/io/kbserver/index/RetrievalEvalTest.java"
  - resource: "repo:tools/retrieval-evals/oms-golden-queries.yaml"
---
# Knowledge retrieval quality

| Category | Metric | Target |
|---|---|---|
| quality | Document recall@5 over the retrieval evaluation queries | ≥ 0.90 |

The golden queries for this knowledge base are in `tools/retrieval-evals/oms-golden-queries.yaml`:
42 queries, at least one per top-level section.
- **How it runs.** kb-server's `RetrievalEvalTest` (from the knowledge-server repository) runs them
  against `oms-knowledge-base`.
- **Floors.** It fails below recall@5 = 0.90 or MRR = 0.80, the floors set in the file.
- **Command:** see [Knowledge Server](../../tools/knowledge-server.md#how-the-index-works).
- **Measured** 2026-11-28, after the move (SPEC-0080): recall@5 = 1.000, MRR = 0.808, the same as
  before it.

Capability: [knowledge-services](../knowledge-services.md).
