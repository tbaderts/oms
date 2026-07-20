# Quick Reference — OMS MCP Knowledge Server

One-page cheat sheet. How it all works: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Tools

### `getKnowledgeBaseOverview()`
Index of all docs: metadata (version/status/category), one-line summaries, H2 section anchors, index stats. **Call once per session for orientation.**

### `searchKnowledgeBase(query, topK?, category?, status?)`
Hybrid search (BM25 + semantic vectors, fused with Reciprocal Rank Fusion; BM25-only when Ollama is unavailable).

| Param | Default | Notes |
|---|---|---|
| `query` | — | natural language or keywords |
| `topK` | 5 | max 20 |
| `category` | — | e.g. `framework`, `concepts` |
| `status` | — | e.g. `Complete`, `Draft` |

Returns markdown; each hit has a **citation** `path#anchor`, breadcrumb, line range, excerpt.

### `readKnowledgeBase(path, anchor?, offset?, limit?)`
| Call | Result |
|---|---|
| `readKnowledgeBase(path)` | whole doc + section outline |
| `readKnowledgeBase(path, anchor)` | one section (anchor from a citation; a section title also works) |
| `readKnowledgeBase(path, null, offset, limit)` | character-paginated slice |

### `searchOrders(filters?, page?, size?, sort?)`
Query oms-core orders. Filters: `orderId`, `symbol`, `side`, `ordType`, `state`, price/qty/time ranges, `account`, …

### `ping()`
Returns `pong`.

---

## Resources & Prompts

- **Resources:** every KB doc as `kb://oms-knowledge-base/<path>` (attachable in MCP clients)
- **Prompts:** `implement-from-spec(spec, feature)` · `validate-against-spec(file, spec)`

---

## Typical Flow

```
getKnowledgeBaseOverview()
  → searchKnowledgeBase("execution bust workflow")
  → readKnowledgeBase("oms-knowledge-base/oms-concepts/execution-reporting.md",
                      "5-execution-bust-workflows")
  → generate/validate code, citing path#anchor
```

## Configuration Quick Hits (`application.yml`)

| Setting | Default |
|---|---|
| `domain.docs.paths` | `../oms-knowledge-base` |
| `knowledge.index.embeddings.enabled` | `true` (graceful BM25 fallback) |
| `spring.ai.ollama.embedding.options.model` | `mxbai-embed-large` |
| `knowledge.index.cache-dir` | `.kb-index` (embedding cache, gitignored) |

## Retrieval Eval

`./gradlew test --tests RetrievalEvalTest` — 25 golden queries, recall@5 + MRR, fails below baseline (0.90). Update `golden-queries.yaml` when the KB grows.
