---
aliases: [architecture/mcp-server]
type: Component
title: "Knowledge Server (MCP)"
description: "oms-mcp-server: a Spring AI MCP server that indexes this knowledge base and gives AI assistants search, read and overview tools for it, plus order search against oms-core."
tags: [component, mcp, spring-ai, knowledge-base, search]
status: draft
updated: "2026-11-14T12:00:00Z"
component: "mcp-server"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/SpringAiApplication.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/kb/KnowledgeBaseTools.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/index/KnowledgeIndexService.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/docs/DocumentRepository.java"
  - resource: "repo:oms-mcp-server/src/main/java/org/example/mcp/oms/OrderSearchMcpTools.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/kb/KnowledgeBaseToolsTest.java"
  - resource: "repo:oms-mcp-server/src/test/java/org/example/mcp/index/RetrievalEvalTest.java"
---
# Knowledge Server (MCP)

`oms-mcp-server` (port 8091) is how AI assistants (Claude Code, Copilot, the developer cockpit's
assistant) read this knowledge base and look up orders. It runs over stdio for a client that starts
it as a subprocess, or as an HTTP service in docker-compose. Capability:
[Knowledge Services](../capabilities/knowledge-services.md).

## Tools

| Tool | What it does |
|---|---|
| `getKnowledgeBaseOverview` | Every concept with type, status, trust tier, staleness, description and top-level sections. Call it once per session. |
| `searchKnowledgeBase` | Hybrid search over sections: BM25 plus semantic embeddings, fused by rank. Filters: `type`, `tag`, `status`, `category` (the top-level section, e.g. `architecture`, `capabilities`). **Deprecated documents (the archive) are left out unless `status=deprecated` is asked for.** |
| `readKnowledgeBase` | A whole document (metadata, body, outline, links and "cited by") or one section by anchor. **A former path of a moved document still works**: the answer starts with `> Moved: <old> is now <new>` (SPEC-0061, from the documents' `aliases`). |
| `searchOrders` | Order search against the oms-core Query API. |
| `ping` | Health check. |

The same index serves `/api/kb` (REST) for the [KB Explorer](kb-explorer.md), in the `local` profile.

## How the index works

- **Documents.** `DocumentRepository` walks `domain.docs.paths` (in compose, `/oms-knowledge-base`
  mounted read-only). It reads OKF front matter (`FrontMatter`, `OkfMetadata`: type, status, tags,
  trust tier, staleness, project keys) and the link graph (`ConceptLinks`: links and backlinks).
  `index.md` and `log.md` are navigation, not concepts.
- **Chunks.** `SectionChunker` splits each document by heading, keeping line numbers, so every hit
  is cited as `path#anchor` with its lines.
- **Index.** `KnowledgeIndexService` keeps an in-process Lucene index: BM25 over section text and
  titles, and k-NN over embeddings from Ollama (`EmbeddingService`, configured model `mxbai-embed-large`).
  Embeddings are cached on disk by content hash (`KNOWLEDGE_INDEX_CACHE_DIR`, the `mcp-kb-index`
  volume in compose), so a restart only embeds changed sections. Without Ollama the server falls
  back to BM25 only.
- **Quality.** `RetrievalEvalTest` runs a golden query set against the real knowledge base and
  fails below recall@5 = 0.90 ([NFR-009](../capabilities/non-functional-requirements/NFR-009-knowledge-retrieval-quality.md)).
  The set has at least one query per top-level section.

The server has needed no external vector store since it moved from Qdrant to the embedded Lucene
index (July 2026); the leftover Qdrant container was removed from compose in SPEC-0061.

Context: [System Context](../architecture/context/system-context.md).
