---
aliases: [architecture/mcp-server]
type: Component
title: "Knowledge Server (MCP)"
description: "kb-server, from the knowledge-server repository: a general-purpose MCP server that serves this knowledge base to AI assistants with search, read and overview tools."
tags: [component, mcp, spring-ai, knowledge-base, search]
status: draft
updated: "2026-11-28T12:00:00Z"
component: "kb-server"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/KbServerApplication.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/kb/KnowledgeBaseTools.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/kb/PlainTextResultConverter.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/index/KnowledgeIndexService.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/main/java/io/kbserver/docs/DocumentRepository.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/test/java/io/kbserver/kb/KnowledgeBaseToolsTest.java"
  - resource: "https://github.com/tbaderts/knowledge-server/blob/main/kb-server/src/test/java/io/kbserver/index/RetrievalEvalTest.java"
  - resource: "repo:tools/retrieval-evals/oms-golden-queries.yaml"
---
# Knowledge Server (MCP)

`kb-server` (port 8091) is how AI assistants read this knowledge base: Claude Code, Copilot and
the developer cockpit's assistant. Capability: [Knowledge Services](../capabilities/knowledge-services.md).

It lives in its own repository, [knowledge-server](https://github.com/tbaderts/knowledge-server),
together with its UI, the [KB Explorer](kb-explorer.md) (`kb-explorer`).
- **General-purpose.** Nothing in it knows about orders. `oms-knowledge-base` is one of the
  knowledge repositories it is configured with. It moved out of this repository in SPEC-0080.
- **Clients.** The developer cockpit's [KB Chat](developer-cockpit.md#kb-chat) uses the three KB
  tools over `/mcp`. When the server is down, the chat falls back to the cockpit's local search.

## Running it for OMS

Clone the repository next to this checkout, then start it with this knowledge base as its
repository:

```bash
git clone https://github.com/tbaderts/knowledge-server ../knowledge-server   # once
cd ../knowledge-server
KB_REPO_NAME=oms-knowledge-base KB_REPO_PATH=../oms/oms-knowledge-base docker compose up -d --build
```

- **Endpoints.** MCP is at `http://localhost:8091/mcp` and the UI at `http://localhost:8097`.
- **Registration.** `.mcp.json` and `.vscode/mcp.json` register the server as `knowledge`.
- **Paths are unchanged.** The repository name is the path prefix, so naming it
  `oms-knowledge-base` keeps every document path, citation, alias and `kb://` resource as it was:
  `oms-knowledge-base/domain/model/order.md` is still `oms-knowledge-base/domain/model/order.md`.
- **Other ways to run it.** The server can also run host-natively or over stdio, and can serve
  several repositories at once. See the knowledge-server README.

## Tools

| Tool | What it does |
|---|---|
| `getKnowledgeBaseOverview` | The repositories, then every concept with type, status, trust tier, staleness, description and top-level sections. Call it once per session. |
| `searchKnowledgeBase` | Hybrid search over sections: BM25 plus semantic embeddings, fused by rank. Details below the table. |
| `readKnowledgeBase` | A whole document (metadata, repository, body, outline, links and "cited by") or one section by anchor. **A former path of a moved document still works**: the answer starts with `> Moved: <old> is now <new>` (from the documents' `aliases`). |
| `ping` | Health check. |

`searchKnowledgeBase` in more detail:
- **Filters:** `repository`, `type`, `tag`, `status`, and `category` (the top-level folder, e.g.
  `architecture`, `capabilities`).
- **Deprecated documents (the archive) are left out** unless `status=deprecated` is asked for.
- **Each hit** is labelled `[repository]` and gives its citation, breadcrumb, lines, facets
  (type · status · trust tier), and its fused score with the ranks it came from, e.g.
  `— score 0.0325 · keyword #1 · semantic #2`. There is no semantic rank without embeddings. An
  excerpt follows.

The tools return their Markdown as written (`PlainTextResultConverter`): clients receive the text,
not a JSON-quoted string.

There is **no order tool** any more. The `searchOrders` tool was removed with the move
([FR-034](../capabilities/functional-requirements/FR-034-search-orders-for-agents.md), withdrawn).
For live orders, use the [Query API](../domain/interfaces/query-api.md).

The same index serves the REST API `/api/kb` for the KB Explorer. It covers repositories,
documents and search, each with an optional `repository` filter.

## How the index works

- **Repositories.** `DocumentRepository` walks each configured repository
  (`knowledge.repositories`: a name and a directory; in compose, the directory is mounted
  read-only).
  - A repository whose directory is missing is reported as unavailable; the others are served.
  - It reads OKF front matter (`FrontMatter`, `OkfMetadata`: type, status, tags, trust tier,
    staleness, project keys) and the link graph (`ConceptLinks`: links and backlinks).
  - `index.md` and `log.md` are navigation, not concepts.
- **Chunks.** `SectionChunker` splits each document by heading, keeping line numbers, so every hit
  is cited as `path#anchor` with its lines.
- **Index.** `KnowledgeIndexService` keeps an in-process Lucene index: BM25 over section text and
  titles, and k-NN over embeddings from Ollama (`EmbeddingService`, configured model
  `mxbai-embed-large`).
  - Embeddings are cached on disk by content hash, so a restart only embeds changed sections.
  - Without Ollama the server falls back to BM25 only.
- **Quality.** The golden query set for this knowledge base lives in this repository, at
  `tools/retrieval-evals/oms-golden-queries.yaml`.
  - It keeps recall@5 at 0.90 or better and MRR at 0.80 or better
    ([NFR-009](../capabilities/non-functional-requirements/NFR-009-knowledge-retrieval-quality.md)),
    with at least one query per top-level section.
  - Run it through kb-server's eval from the knowledge-server checkout:

```bash
cd ../knowledge-server/kb-server
./gradlew test --tests '*RetrievalEvalTest' \
  -Pkb.eval.repository=oms-knowledge-base=../../oms/oms-knowledge-base \
  -Pkb.eval.golden=../../oms/tools/retrieval-evals/oms-golden-queries.yaml
```

The server needs no external vector store: it moved from Qdrant to the embedded Lucene index in
July 2026.

Context: [System Context](../architecture/context/system-context.md).
