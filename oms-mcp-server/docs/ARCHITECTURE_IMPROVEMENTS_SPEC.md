# OMS MCP Knowledge Server — Architecture Improvements Specification

**Version:** 1.1
**Status:** Phases 1+2 Implemented
**Last Updated:** 2026-06-10
**Category:** framework
**Supersedes:** `ARCHITECTURE_ANALYSIS.md` (2025-10-08, removed) — that document predated the semantic search implementation and no longer reflected the codebase.

> **Reading guide:** this is the *decision and roadmap* document — it records the
> problems with the pre-refactor system, the options weighed, and what was
> chosen. For a description of the system **as it works today**, see
> [ARCHITECTURE.md](ARCHITECTURE.md). The "Current Architecture Assessment" in §2
> below is the *pre-refactor* baseline that motivated these changes, kept for
> historical context.

---

## Decision Record & Implementation Status (2026-06-10)

The following decisions were taken and **Phases 1 and 2 are implemented**:

| Decision | Outcome |
|---|---|
| Platform | **Stay on Java.** Spring AI upgraded to **2.0.0** (final, from 2.0.0-M1); Spring Boot 4.1. The TypeScript-migration analysis in §7 is retained for future reference; re-evaluation is optional, not planned. |
| Corpus framing | This KB (26 docs) is a **blueprint/prototype for a project with 200+ specifications**. The architecture is deliberately sized for that target: section-granular Lucene index, incremental embedding cache, eval harness. §3's "small corpus" arguments still hold *today* but the design no longer depends on them. |
| Embeddings | **Ollama stays** (local-only). Default model upgraded to `mxbai-embed-large` with its query instruction prefix; model + prefixes are configurable (`knowledge.index.embeddings.*`). Cloud options in §4.3 remain documented but unused. |
| Keyword search | **Apache Lucene embedded** (BM25, EnglishAnalyzer, title boost) — A1-a implemented. |
| Fusion | **RRF (k=60)** implemented; weight parameters removed — A2 done. |
| Chunking | Heading-aware section chunks with breadcrumbs, tiny-merge and fence-safe splitting — A5 done. |
| Tool surface | Consolidated to `searchKnowledgeBase` / `readKnowledgeBase` / `getKnowledgeBaseOverview` with `path#anchor` citations and markdown responses — B1–B3 done. |
| MCP-native | Resources (`kb://<path>` per doc) and prompts (`implement-from-spec`, `validate-against-spec`) registered — B4 done. |
| Infrastructure | **Qdrant and Docker removed** (C1-a: Lucene HNSW in-process). Incremental indexing via content-hash embedding cache (`.kb-index/`) — C2 done. |
| Evaluation | 25-query golden set, recall@5 + MRR in `RetrievalEvalTest`, runs with every build — C3 done. **Measured: recall@5 = 1.000, MRR = 0.903 (BM25-only).** |
| Reranking | **Skipped** per §4.4 — eval results confirm it is unnecessary at current scale. Revisit when the 200+ spec corpus materializes and evals degrade. |

Remaining open items (Phase 3): contextual-retrieval experiment (§4.5 stretch), platform re-evaluation if ever desired, scale-threshold review as the KB grows toward 200+ specs (§9.1).

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Current Architecture Assessment](#2-current-architecture-assessment)
3. [Framing Insight: Corpus Scale Changes Everything](#3-framing-insight-corpus-scale-changes-everything)
4. [Improvement Area A — Retrieval Quality](#4-improvement-area-a--retrieval-quality)
5. [Improvement Area B — Agent-Facing Tool Design](#5-improvement-area-b--agent-facing-tool-design)
6. [Improvement Area C — Infrastructure Simplification & Operations](#6-improvement-area-c--infrastructure-simplification--operations)
7. [Improvement Area D — Platform Options](#7-improvement-area-d--platform-options)
8. [Phased Roadmap](#8-phased-roadmap)
9. [Decision Matrices](#9-decision-matrices)
10. [References](#10-references)

---

## 1. Purpose & Scope

The `oms-mcp-server` makes OMS domain knowledge (specifications, concepts, architecture docs in `oms-knowledge-base/`) available to coding agents via the Model Context Protocol. It currently offers keyword search, semantic (vector) search, and a hybrid combination of the two.

This spec assesses the current implementation against the state of the art for **agent-facing retrieval** and proposes concrete improvements in four areas:

- **A — Retrieval quality:** scoring, fusion, embeddings, reranking, chunking
- **B — Agent-facing tool design:** tool surface, citations, return formats, MCP-native features
- **C — Infrastructure & operations:** dependency footprint, indexing lifecycle, evaluation
- **D — Platform:** Spring AI/Java vs. TypeScript/Python MCP SDKs

Each area presents options with trade-offs and a recommendation. A phased roadmap at the end sequences the work.

**Out of scope:** the `searchOrders` OMS query tool (a thin client to oms-core; unaffected by retrieval changes) and the knowledge-base *content* itself (covered by `oms-knowledge-base-strategy.md`).

---

## 2. Current Architecture Assessment

### 2.1 System Overview

```
MCP Client (Claude Code, Copilot, Claude Desktop)
        │  stdio / JSON-RPC
        ▼
oms-mcp-server (Spring Boot 4.0.2, Spring AI 2.0.0-M1, Java 25)
        │
        ├── DomainDocsTools ──────► in-memory file index over oms-knowledge-base/
        │     (keyword + section search, full reads)
        ├── SemanticSearchTools ──► Qdrant (gRPC :6334) ◄── embeddings: Ollama nomic-embed-text (768-dim)
        ├── OrderSearchMcpTools ──► oms-core REST API (:8090)
        └── HealthTools
```

**Corpus:** 26 markdown files, ~704 KB, in `oms-knowledge-base/` (`oms-framework/`, `oms-concepts/`, `illustrations/`, plus strategy docs).

**Tool surface (10 tools):**

| Category | Tools |
|---|---|
| Keyword / navigation (6) | `listDomainDocs`, `readDomainDoc`, `searchDomainDocs`, `listDocSections`, `readDocSection`, `searchDocSections` |
| Hybrid (1) | `hybridSearchDocs` |
| Semantic (2) | `semanticSearchDocs`, `getVectorStoreInfo` |
| OMS / health (2) | `searchOrders`, `ping` |

### 2.2 Findings — Retrieval Pipeline

**F1. Keyword scoring is raw term frequency, not BM25.**
`KeywordSearchEngine.scoreContent()` sums case-insensitive *substring* occurrence counts:

```java
// KeywordSearchEngine.java
public int scoreContent(String content, Set<String> terms) {
    String lc = content.toLowerCase(Locale.ROOT);
    int score = 0;
    for (String t : terms) {
        score += countOccurrences(lc, t);
    }
    return score;
}
```

Consequences:
- **No IDF weighting** — common terms ("order", "state") dominate scores; rare discriminating terms ("allocation", "RRF") carry no extra weight. In an OMS knowledge base where nearly every document mentions "order", this is a significant relevance problem.
- **No length normalization** — long documents (e.g., `order-replace.md`, 43 KB) win simply by being long.
- **Substring matching, not tokenization** — query term `art` matches "p**art**ial", "st**art**", "ch**art**"; `state` matches "e**state**". False positives are structural, not incidental.

**F2. Hybrid fusion uses fragile min-max score normalization.**
`hybridSearchDocs` normalizes keyword scores by dividing by the max keyword score, takes semantic similarity as-is, and computes a weighted sum (default 0.4/0.6). The two score distributions are not comparable: a normalized TF of 1.0 ("most term hits in this result set") and a cosine similarity of 0.78 mean entirely different things. Results are sensitive to outliers (a single high-TF doc compresses every other keyword score toward 0) and to the arbitrary weight choice.

**F3. The embedding model is used without its required task prefixes.**
`nomic-embed-text` is trained with instruction prefixes: documents must be embedded as `search_document: <text>` and queries as `search_query: <text>`. Neither `DocumentIndexerService` (indexing) nor `SemanticSearchTools` (querying) applies them. The model still produces vectors, but retrieval quality is measurably degraded versus its benchmark performance — this is the cheapest quality fix available in the whole system.

**F4. Chunking is structure-blind.**
`DocumentIndexerService` splits with Spring AI's generic `TokenTextSplitter` (1000 tokens, 200 overlap). For markdown specs this means:
- Chunks routinely cut across section boundaries, mixing unrelated topics in one embedding.
- A chunk carries no information about *where* it sits in the document — a chunk from "domain-model_spec.md → Order → State Transitions" embeds and renders identically to body text with no context.
- Tables and code blocks get split mid-structure.

Ironically, the server already has a `MarkdownParser` that extracts sections and headings for the keyword tools — the structural knowledge exists but isn't used for the vector pipeline.

**F5. No reranking, no query rewriting, no caching.** Results are returned in raw retrieval order. (At the current corpus size these are optional — see §4.4 — but the spec records the options.)

### 2.3 Findings — Agent-Facing Surface

**F6. Tool sprawl: 8 overlapping knowledge tools.**
An agent deciding how to find "how partial fills affect order state" must choose between `searchDomainDocs`, `searchDocSections`, `semanticSearchDocs`, and `hybridSearchDocs` — four search tools with different scoring, different parameters (`topK`, `filterStatus`, `filterCategory`, `similarityThreshold`, `keywordWeight`, `semanticWeight`) and different return shapes. Frontier models handle this, but every redundant tool:
- consumes tool-definition tokens in *every* request the client sends,
- adds a decision the model can get wrong,
- splits usage data, making it harder to learn which retrieval path works.

The empirical guidance from MCP practice is consistent: **fewer, more powerful, well-described tools outperform many narrow ones.**

**F7. No citations.**
`SearchHit` returns `(path, score, snippet)` with a 240-character snippet around the first term match. There is no section anchor, no line range, no heading context. An agent that wants to (a) quote the spec authoritatively or (b) read the surrounding section must guess, or call `listDocSections` + `readDocSection` and re-locate the hit manually. `SemanticSearchResult` returns `chunkIndex`/`totalChunks` — coordinates in an arbitrary token-window space that no other tool can address.

**F8. JSON record return shapes are suboptimal for model consumption.**
The tools return serialized Java records. Models read markdown more reliably than nested JSON, and the current shape provides no guidance ("to read the full section, call `read` with this anchor").

**F9. Only MCP *tools* are used.**
MCP also defines **resources** (client-attachable documents — ideal for "pin the domain-model spec into context") and **prompts** (reusable workflows, e.g. "implement against spec X"). The server registers neither; `McpConfig` wires only `MethodToolCallbackProvider`.

### 2.4 Findings — Infrastructure & Operations

**F10. Heavy infrastructure for a 704 KB corpus.** Semantic search requires Docker, a Qdrant container, an Ollama install, and a pulled model — for 26 files. The graceful degradation (semantic tools disabled when Qdrant is absent) is well done, but in practice it means many environments silently run keyword-only.

**F11. Full re-embedding on every startup.** `autoIndexOnStartup` re-reads, re-chunks, and re-embeds the entire corpus on each application start. No content hashing, no incremental updates, no change detection.

**F12. No evaluation harness.** There is no golden query set and no retrieval metric (recall@k, MRR). Every retrieval claim in this spec — and every future change — is currently unverifiable except by anecdote. This also enabled F13:

**F13. Documentation drift.** `README.md` claims "9 specification documents (85.6 KB)" (actual: 26 / ~704 KB). `ARCHITECTURE_ANALYSIS.md` describes a keyword-only system; the vector package landed one day after that document was committed and the analysis was never revisited.

### 2.5 Strengths Worth Preserving

- **Clean tool registration** — `@Tool`-annotated methods + `MethodToolCallbackProvider`; adding tools is trivial.
- **Section-aware navigation** — `listDocSections` / `readDocSection` already give agents structural access; this is the right instinct and becomes the backbone of the citation model (§5.2).
- **Metadata extraction** — `MarkdownParser` pulls version/status/category from doc headers, enabling filtered search.
- **Graceful degradation** — semantic tools conditionally enabled; the server is useful without its vector stack.
- **Local-first defaults** — no knowledge-base content leaves the machine today.

---

## 3. Framing Insight: Corpus Scale Changes Everything

The knowledge base is **~704 KB ≈ 180K tokens** across 26 files. This single fact should drive most architecture decisions, because it places the system in a regime where classic RAG intuitions mislead:

1. **The whole corpus nearly fits in one frontier-model context window.** Any individual document (max 43 KB ≈ 11K tokens) is a cheap single read. Retrieval here is about *navigation efficiency*, not about fitting an ocean of text through a keyhole.

2. **Frontier coding agents are agentic searchers.** Claude Code, Copilot agent mode, and similar clients do not issue one query and accept five chunks — they iterate: *get an overview → search → read the promising section in full → follow references*. This is the same loop they use on source code (glob → grep → read). The server's job is to make each step of that loop excellent, not to compress everything into a one-shot top-5 chunk response.

3. **Returned chunks are the weakest format for this loop.** A 1000-token chunk with no anchor is a dead end: the agent can't cite it precisely and can't cheaply expand it. A *section hit with a citation* (`path#anchor`, heading breadcrumb, line range) is a live link: quote it, or pull the full section with one `read` call.

4. **Therefore, the priority order is:** agent-facing tool design (Area B) > retrieval scoring quality (Area A) > infrastructure sophistication (Area C). Reranking, query rewriting, and vector-DB tuning — the usual RAG escalation ladder — are the *lowest*-leverage investments at this scale.

This does not mean semantic search is useless here — vocabulary-mismatch queries ("how do I undo an order" → order-replace/cancel docs) genuinely benefit. It means semantic search should be one ingredient inside a single good `search` tool, not a separate destination.

> **If the KB grows 10–50×** (e.g., indexing source code, ADRs, runbooks, FIX specs), the calculus shifts back toward classic RAG infrastructure. §9.1 records the thresholds.
>
> **Update (2026-06-10):** this is not hypothetical — the OMS KB is a blueprint for a project with **200+ specifications** (~10× today's corpus). The implemented design anticipates that: the Lucene index handles that size trivially in-process, the embedding cache makes re-indexing incremental, and the eval harness is the instrument for noticing when (and if) reranking or stronger embeddings become necessary. The agentic-navigation principles above hold at 200+ docs too — the overview tool's per-doc summaries simply become more valuable.

---

## 4. Improvement Area A — Retrieval Quality

### 4.1 A1 — Replace TF counting with BM25 (and real tokenization)

BM25 fixes all three defects of F1 in one move: IDF weighting (rare terms matter more), document-length normalization, and — via its analysis chain — proper word tokenization instead of substring matching.

| Option | Description | Effort | Trade-offs |
|---|---|---|---|
| **A1-a: Embedded Apache Lucene** ✅ recommended (Java path) | Add `lucene-core` + `lucene-analysis-common`; index sections as Lucene documents (fields: `path`, `anchor`, `breadcrumb`, `body`, `category`, `status`); `BM25Similarity` is the default since Lucene 6. | ~2–3 days | One battle-tested in-process dependency (no server). Free extras: phrase queries, fuzzy matching, field boosts (title hits > body hits), highlighting for snippets. The 700 KB index lives comfortably in `MMapDirectory` or `ByteBuffersDirectory` (in-memory). |
| **A1-b: Hand-rolled BM25** | Keep `KeywordSearchEngine`, replace the scoring loop: tokenize on word boundaries at index time, precompute per-term document frequencies, apply the BM25 formula (k1≈1.2, b≈0.75). | ~1 day | Zero new dependencies; ~100 LoC; perfectly adequate for 26 docs. But you re-implement (and must test) tokenization, stemming decisions, and snippets that Lucene gives for free. |

**Recommendation:** A1-a if staying on Java (the same Lucene index can later absorb the vector side too, §6.1); A1-b only as an interim stopgap. Either way, **index at section granularity, not file granularity**, so keyword results natively carry the citation anchors that Area B requires.

### 4.2 A2 — Replace weighted score fusion with Reciprocal Rank Fusion (RRF)

RRF combines result lists by *rank*, not by score:

```
RRF(d) = Σ over retrievers r of:  1 / (k + rank_r(d))      (k = 60, standard)
```

Why this beats the current min-max weighted sum (F2):

- **Score distributions never need to be comparable.** BM25 scores (unbounded) and cosine similarities (0–1) fuse cleanly because only ordering matters.
- **Robust to outliers** — one extreme score can't distort the rest of the list.
- **No weights to tune.** The `keywordWeight`/`semanticWeight` parameters can be deleted; in practice agents never set them meaningfully anyway.
- It is the industry-default hybrid method (built into Elasticsearch, OpenSearch, Azure AI Search, Weaviate) with strong empirical support since Cormack et al. 2009.

**Effort:** trivial (~30 LoC replacing the fusion block in `DomainDocsTools.hybridSearchDocs`). Keep an optional boost for documents found by *both* retrievers if precision needs a nudge.

### 4.3 A3 — Fix and (optionally) upgrade embeddings

**Immediate, zero-cost fix (do first):** apply nomic task prefixes.

- `DocumentIndexerService` — embed chunks as `"search_document: " + chunkText`
- `SemanticSearchTools` — embed queries as `"search_query: " + query`

This requires prefixing the text passed to the embedding call while storing/returning the unprefixed text. Re-index once after the change. Expected effect: a few points of recall, free.

**Model options (after the prefix fix, validate with the eval harness from §6.3 before switching):**

| Model | Type | Dim | Notes |
|---|---|---|---|
| `nomic-embed-text` (current) | Local (Ollama) | 768 | Fine *with prefixes*; weakest of the local options on modern benchmarks. |
| `mxbai-embed-large` | Local (Ollama) | 1024 | Stronger retrieval quality; needs `Represent this sentence for searching relevant passages:` query prefix. |
| `bge-m3` | Local (Ollama) | 1024 | Strong multilingual + long-context (8K); also produces sparse signals (unused via Ollama). |
| `snowflake-arctic-embed2` | Local (Ollama) | 1024 | Top-tier open retrieval model family. |
| `voyage-3-large` / `voyage-code-3` | **Cloud** (Voyage AI) | 1024–2048 | Best-in-class retrieval; `voyage-code-3` notable if source code is ever indexed. Per-token cost; KB text leaves the machine. |
| `text-embedding-3-large` | **Cloud** (OpenAI) | 3072 (truncatable) | Strong, ubiquitous, cheap at this corpus size (~180K tokens ≈ cents to index). |
| `gemini-embedding-001` | **Cloud** (Google) | 3072 (MRL) | Top MTEB performer. |

**Local vs cloud trade-off:** at 180K tokens, cloud indexing cost is negligible (cents) and query cost is per-search pennies; the real considerations are (a) **privacy** — OMS specs are internal financial-domain IP; (b) **operational simplicity** — cloud removes the Ollama dependency entirely; (c) **availability** — cloud adds a network dependency to a developer-machine tool. For a financial-domain knowledge base the conservative default is **local**, with cloud as an explicitly approved opt-in. (User decision: both presented; no commitment forced here.)

### 4.4 A4 — Reranking: options, and why "none" is currently defensible

A cross-encoder reranker re-scores the top-N candidates against the query with full attention — typically the single biggest quality jump in large-corpus RAG.

| Option | Description | Trade-offs |
|---|---|---|
| **A4-a: No reranker** ✅ recommended now | Rely on BM25 + fixed embeddings + RRF + section-aware chunks. | With 26 docs / a few hundred sections, the candidate pool is so small that fused retrieval almost always surfaces the right section in the top 5. Re-evaluate with eval-harness data, not intuition. |
| A4-b: Local cross-encoder | `bge-reranker-v2-m3` via ONNX Runtime (Java bindings exist) or an Ollama-hosted reranker; rerank top-20 → return top-5. | +quality, but adds latency (~100–500 ms), a model-serving concern, and Java-side ML plumbing. |
| A4-c: Cloud reranker | Cohere Rerank 3.5 or Voyage `rerank-2`: one HTTPS call, top-20 docs + query in, reranked list out. | Best quality:effort ratio *if* cloud is allowed; same privacy consideration as §4.3. |
| A4-d: LLM-as-reranker | The *calling agent* already reranks implicitly — it reads the 5 results and picks what to pursue. Returning slightly more, well-cited, compact results (§5.3) exploits this for free. | Zero infra; this is part of why citations matter more than reranking at this scale. |

**Recommendation:** A4-a now; revisit after the eval harness exists. If evals show top-5 recall < ~90% on golden queries after Phase 1, add A4-c (cloud-permitted) or A4-b (local-only).

### 4.5 A5 — Structure-aware chunking with heading breadcrumbs

Replace `TokenTextSplitter` with markdown-structure-aware splitting, reusing the existing `MarkdownParser`:

1. **Split on headings** — each section (H2/H3 granularity) becomes one chunk. Merge tiny sections (< ~100 tokens) with siblings; split oversized sections (> ~1200 tokens) at paragraph boundaries, never inside tables or code fences.
2. **Prepend a breadcrumb header to every chunk** before embedding *and* in the returned text:
   ```
   [domain-model_spec.md > Order > State Transitions]
   <section text…>
   ```
   This contextualizes the embedding (disambiguating, e.g., "State Transitions" of an Order vs. a Task) and gives the reading agent immediate orientation.
3. **Carry citation metadata on every chunk:** `path`, `anchor` (GitHub-style slug of the heading), `breadcrumb`, `start_line`/`end_line`, plus the existing doc metadata (version/status/category).
4. **Align all three retrieval paths on the same unit.** Keyword (Lucene section docs), semantic (section chunks), and `readDocSection` then share one addressing scheme — which is what makes RRF fusion and citations (§5.2) coherent.

**Stretch option — contextual retrieval (Anthropic, 2024):** prepend a short LLM-generated context blurb ("This section, within the order-replace spec, describes how pending replaces interact with partial fills…") to each chunk before embedding. Reported ~35–49% retrieval-failure reduction on large corpora. At this corpus size the breadcrumb captures most of the benefit for free; treat contextual enrichment as a Phase 3 experiment, gated on eval results, and note it requires an LLM in the indexing pipeline (local or cloud — same privacy axis as §4.3).

---

## 5. Improvement Area B — Agent-Facing Tool Design

> **This is the highest-leverage area.** It improves results for every client regardless of which retrieval internals are chosen, and it is what "working better with frontier models" mostly means in practice.

### 5.1 B1 — Consolidate the tool surface: 8 knowledge tools → 3

Proposed surface:

| Tool | Replaces | Signature (conceptual) |
|---|---|---|
| **`searchKnowledgeBase`** | `searchDomainDocs`, `searchDocSections`, `semanticSearchDocs`, `hybridSearchDocs` | `(query, topK?, category?, status?)` → ranked, cited section hits. Hybrid (BM25 + vector + RRF) **by default**; degrades to BM25-only when the vector stack is unavailable — invisible to the caller. No `keywordWeight`/`semanticWeight`/`similarityThreshold` knobs: agents should not tune retrieval internals. |
| **`readKnowledgeBase`** | `readDomainDoc`, `readDocSection`, (most uses of `listDocSections`) | `(path, anchor?, offset?, limit?)` → full doc or single section, with line numbers and the doc's section outline appended when reading whole docs. One address scheme: the same `path#anchor` that search results cite. |
| **`getKnowledgeBaseOverview`** | `listDomainDocs`, `listDocSections` (discovery uses) | `()` → llms.txt-style index: every doc with breadcrumbed section tree and a one-line summary per doc, plus KB stats and freshness. Cheap enough (~2–4K tokens) for agents to call once per session and navigate from. |

Kept as-is: `searchOrders`, `ping`. `getVectorStoreInfo` becomes a diagnostics detail folded into `ping`/health rather than a first-class agent tool.

**Tool-description guidelines** (frontier models follow descriptions closely — invest here):
- State *when to use which tool*: "Use `getKnowledgeBaseOverview` first in a session; use `searchKnowledgeBase` for questions; use `readKnowledgeBase` to read a cited section in full before relying on it."
- Describe the citation contract explicitly: "Results include `path#anchor` citations — pass them to `readKnowledgeBase` to expand."
- Include one example call + abbreviated example response per tool description.

### 5.2 B2 — Citations as the core contract

Every search hit returns a **stable, actionable citation**:

```json
{
  "citation": "oms-framework/domain-model_spec.md#state-transitions",
  "breadcrumb": "domain-model_spec.md > Order > State Transitions",
  "lines": "142-198",
  "score": 0.0163,
  "docStatus": "Complete",
  "excerpt": "…the Order transitions from PendingNew to New when…"
}
```

Properties of the scheme:
- `path#anchor` uses GitHub-style heading slugs — human-readable, valid in markdown links, stable as long as the heading survives.
- The **same address works in `readKnowledgeBase`** — a hit is always one tool call away from its full context.
- Line ranges let agents cite precisely in code review comments and commit messages ("per `domain-model_spec.md#state-transitions` (L142–198) …"), which is exactly the spec-driven-development behavior the project wants to encourage.
- Excerpts are **section-aligned** (from the chunk model of §4.5), never arbitrary 240-char windows.

### 5.3 B3 — Return format & budgets

- **Render results as markdown**, not nested JSON records. Models parse a compact markdown list with bold citations more reliably, and it reads well in MCP client UIs. (Spring AI tools can return a `String`; the structured-record approach is kept only where a client genuinely consumes fields.)
- **Response budget:** target ≤ ~2,000 tokens per search response. Default `topK = 5` hits with ~150-token excerpts; explicitly state in the response when more results exist ("12 further matches — refine the query or raise topK").
- **Next-action hints in-band:** end search responses with `To read any section in full: readKnowledgeBase(path, anchor)`. Cheap, and measurably increases correct follow-up behavior.
- **Empty-result honesty:** on zero hits, return the overview's category list and suggest 2–3 reformulations instead of an empty array.

### 5.4 B4 — Use MCP resources and prompts, not only tools

- **Resources:** register every KB document as an MCP resource (`kb://oms-framework/domain-model_spec.md`), with the overview index as a resource too. Clients like Claude Desktop/Claude Code let users *attach* resources directly — "pin the domain model spec to this conversation" without any tool round-trip. Spring AI's MCP server supports resource registration (`McpServerFeatures.SyncResourceSpecification`); only tools are wired today in `McpConfig`.
- **Prompts:** register 2–3 MCP prompts encoding the team's spec-driven workflow, e.g. `implement-from-spec(specPath)` ("Read the spec section, restate constraints, write tests first, then implement, citing spec anchors") and `validate-against-spec(filePath, specPath)`. This moves the guidance currently buried in `COPILOT_PROMPTS_LIBRARY.md` into the protocol where every MCP client can discover it.

---

## 6. Improvement Area C — Infrastructure Simplification & Operations

### 6.1 C1 — Right-size the vector infrastructure

Qdrant (Docker) + Ollama is a lot of moving parts for 26 files, and F10 shows the practical cost: environments without Docker silently lose semantic search.

| Option | Components | Trade-offs |
|---|---|---|
| **C1-a: Embedded Lucene for both BM25 and vectors** ✅ recommended (Java path) | Lucene `KnnFloatVectorField` (HNSW) in the same index as §4.1 | **Zero external services for retrieval.** One index, one addressing scheme, hybrid search in-process. Embeddings still need a provider (Ollama or cloud) — but only at *indexing* time plus one call per query. |
| C1-b: Spring AI `SimpleVectorStore` | In-memory, JSON-persistable | Simplest possible; fine at this scale; brute-force search (irrelevant for a few hundred vectors); no metadata-filter pushdown. |
| C1-c: Keep Qdrant | Docker + Qdrant | Justified only if the KB grows ~50× or multiple services must share the index. Today it is capability surplus paid for in setup friction. |
| C1-d: sqlite-vec / pgvector | Embedded SQLite ext. / existing Postgres | pgvector is attractive *iff* reusing the OMS Postgres; otherwise adds coupling between a dev tool and the runtime database. |

**Recommendation:** C1-a (or C1-b as the minimal step). Retire the Qdrant dependency; keep the `VectorStore` abstraction so Qdrant can return if scale demands it. Document the growth thresholds (§9.1).

### 6.2 C2 — Incremental indexing

Replace `autoIndexOnStartup`'s full re-embed (F11) with a content-hash manifest:

1. On startup, compute SHA-256 per KB file; compare against a persisted manifest (`.index-manifest.json` next to the index).
2. Re-chunk/re-embed only added/changed files; delete vectors for removed files; skip the rest. Typical startup: 0 files changed → 0 embedding calls.
3. Bump an `indexVersion` (covering chunker settings + embedding model + prefix scheme) that forces a full rebuild when the pipeline itself changes.
4. Optional: a `WatchService` on `oms-knowledge-base/` for live re-index during doc-editing sessions (the server is long-running under MCP clients).

### 6.3 C3 — Evaluation harness (prerequisite for everything else)

No retrieval change in this spec should ship unmeasured. Build the smallest harness that works:

- **Golden set:** 20–30 real queries (mine them from `COPILOT_PROMPTS_LIBRARY.md`, team usage, and each doc's purpose), each labeled with the expected `path#anchor`(s). Stored as YAML/JSON in `oms-mcp-server/src/test/resources/retrieval-evals/`.
- **Metrics:** recall@5 and MRR, per retriever (BM25-only, vector-only, hybrid) — three numbers that settle every "is X better?" debate in this spec.
- **Execution:** a JUnit test (tagged `@Tag("eval")`) runnable locally and in CI; fail the build if recall@5 drops below a pinned baseline.
- **Process:** every Phase 1 change (BM25, RRF, prefixes, chunking) lands with a before/after eval delta in the PR description — in line with the team's data-driven-decision-making value.

### 6.4 C4 — Housekeeping

- Correct `README.md` corpus claims (26 files / ~704 KB) and tool list; mark `ARCHITECTURE_ANALYSIS.md` as superseded by this document (banner at top).
- Add a short "doc drift" check: the eval harness can assert that README's advertised tool list matches the registered `@Tool` methods.
- Caching: unnecessary once the index is in-memory/embedded; do not add a cache layer speculatively.

---

## 7. Improvement Area D — Platform Options

The server exists in Java because the team is a Java shop, not because Java is the natural habitat for this workload. With migration on the table, the honest comparison:

### Option D1 — Stay on Java / Spring AI

- **Pros:** zero switching cost; team fluency; single build/toolchain (`gradlew`); `searchOrders` shares models with oms-core conventions; Lucene is a first-class *Java* asset — arguably the best BM25 implementation anywhere lives in this ecosystem.
- **Cons / risks:** Spring AI is at **2.0.0-M1** — a milestone release; APIs have already shifted (this repo's git history includes "mcp bug fixes related to spring boot 4 update"). The Java AI ecosystem trails Python/TS for embeddings, rerankers, and MCP feature adoption (resources/prompts/sampling support arrives later).
- **Mitigations:** LangChain4j is a more stable Java alternative for the embedding/store layer; more importantly, the §4–§6 design (Lucene + a thin embedding client + RRF) depends on Spring AI *only* for MCP transport and `@Tool` registration — a deliberately small contact surface.

### Option D2 — TypeScript MCP SDK (recommended migration candidate)

- **Pros:** `@modelcontextprotocol/sdk` is the **reference implementation** — new protocol features (resources, prompts, sampling, elicitation) land there first; the MCP client ecosystem (Claude Code, Copilot, Cursor) is predominantly TS, so examples/issues/fixes match; markdown tooling (`remark`/`unified`) and BM25/minisearch/Orama libraries are mature; startup is near-instant vs. JVM+Spring boot time (relevant for stdio servers spawned per-session); the oms-ui team already maintains JS tooling.
- **Cons:** second language for the backend team; retrieval pieces (BM25, chunking) re-implemented or sourced from npm rather than Lucene.
- **Scope reality check:** the MCP server is a *thin adapter* — ~1,400 lines across the tool classes, mostly file I/O, string handling, and one REST client. `searchOrders` remains a fetch to oms-core's REST API; **no domain logic moves out of Java.** A TS rewrite implementing the §5 tool surface is roughly 1–2 weeks including parity evals.

### Option D3 — Python (FastMCP / LlamaIndex ecosystem)

- **Pros:** richest retrieval/RAG ecosystem (rerankers, evaluation tooling, every embedding model); FastMCP is ergonomic.
- **Cons:** introduces a *third* language with no existing footprint in this repo; the ecosystem advantage mostly pays off for heavy RAG experimentation, which §3 argues against at this scale.

### Recommended strategy: phased, eval-gated

1. **Do Phase 1 (§8) in Java.** Every Phase 1 item (prefixes, BM25, RRF, chunking, citations, tool consolidation) is cheap in Java and — crucially — *platform-independent design work*: the tool contract, citation scheme, chunk model, and golden-query set transfer verbatim to any future implementation.
2. **Decide migration after Phase 1, with evidence.** The eval harness gives an objective yardstick; a TS port must match recall@5/MRR before cutover. Decision drivers recorded in §9.2.
3. **If migrating, migrate only the knowledge server.** oms-core, the REST contract, and the knowledge base itself are untouched; the MCP client config swaps one launch command.

This avoids the classic trap of rewriting the platform *while* redesigning the retrieval — Phase 1 fixes the design once, in the environment where the team is fastest today.

---

## 8. Phased Roadmap

### Phase 1 — Quick wins (days, all in Java, no infra changes) ✅ IMPLEMENTED 2026-06-10

| # | Item | Spec ref | Effort |
|---|---|---|---|
| 1.1 | Apply nomic `search_query:` / `search_document:` prefixes; re-index | §4.3 | hours |
| 1.2 | Section-aligned, breadcrumbed chunking (reuse `MarkdownParser`) | §4.5 | 1–2 d |
| 1.3 | BM25 via embedded Lucene over section units | §4.1 | 2–3 d |
| 1.4 | RRF fusion replacing weighted min-max | §4.2 | hours |
| 1.5 | Citations (`path#anchor`, breadcrumb, lines) on all hits | §5.2 | 1 d (mostly falls out of 1.2/1.3) |
| 1.6 | Tool consolidation → `searchKnowledgeBase` / `readKnowledgeBase` / `getKnowledgeBaseOverview`; markdown responses, budgets, hints | §5.1, §5.3 | 1–2 d |
| 1.7 | README correction; supersede banner on `ARCHITECTURE_ANALYSIS.md` | §6.4 | hours |

### Phase 2 — Consolidation (weeks) ✅ IMPLEMENTED 2026-06-10 (2.5: model upgraded to mxbai-embed-large; broader bake-off still open)

| # | Item | Spec ref |
|---|---|---|
| 2.1 | Eval harness: golden queries, recall@5/MRR, CI gate *(start alongside Phase 1 — items 1.1–1.6 should report eval deltas)* | §6.3 |
| 2.2 | Incremental indexing (hash manifest, indexVersion) | §6.2 |
| 2.3 | Retire Qdrant: Lucene HNSW (or SimpleVectorStore) for vectors | §6.1 |
| 2.4 | MCP resources for KB docs; 2–3 MCP prompts for spec-driven workflows | §5.4 |
| 2.5 | Embedding model bake-off (local candidates; cloud if approved), eval-gated | §4.3 |

### Phase 3 — Strategic (eval-gated decisions) — open; 3.1 resolved as "stay on Java", 3.2 resolved as "skip for now" (eval-confirmed)

| # | Item | Spec ref |
|---|---|---|
| 3.1 | Platform decision: TS migration of the knowledge server, parity-proven by the eval harness | §7 |
| 3.2 | Reranking — only if Phase 1+2 evals show top-5 recall < ~90% | §4.4 |
| 3.3 | Contextual-retrieval chunk enrichment experiment | §4.5 |
| 3.4 | Revisit scale thresholds if KB scope expands (code, ADRs, runbooks) | §9.1 |

---

## 9. Decision Matrices

### 9.1 Local vs. cloud, per component

| Component | Local option | Cloud option | Decision driver |
|---|---|---|---|
| Embeddings | Ollama (`nomic` fixed → `mxbai`/`arctic` upgrade) | Voyage 3 / OpenAI TE-3-large (cents at this scale) | **Privacy of OMS specs** vs. removing the Ollama dependency. Default local; cloud as approved opt-in. |
| Reranking | bge-reranker-v2-m3 via ONNX | Cohere Rerank 3.5 / Voyage rerank-2 | Skip both for now (§4.4); cloud first if evals demand one and policy allows. |
| Vector store | Embedded Lucene HNSW / SimpleVectorStore | (managed Qdrant/pgvector services) | Embedded wins outright at 26 docs; no cloud case exists at this scale. |
| Keyword search | Lucene BM25 | — | Purely local by nature. |
| Chunk enrichment (Phase 3) | Local LLM via Ollama | Claude/GPT API | Same privacy axis; only relevant if 3.3 is pursued. |

**Scale thresholds (record once, revisit on KB growth):** embedded retrieval comfortably serves up to ~50 MB / ~10K sections. Beyond that, reconsider a vector DB service; beyond ~100K sections, reconsider reranking and contextual retrieval as defaults rather than options.

### 9.2 Platform comparison

| Criterion | Java / Spring AI | TypeScript MCP SDK | Python (FastMCP) |
|---|---|---|---|
| Team fluency | ✅ native | ◐ (oms-ui team has JS) | ✗ new language |
| MCP feature velocity (resources, prompts, sampling) | ◐ lags reference | ✅ reference impl. | ✅ close second |
| Framework stability | ✗ Spring AI 2.0.0-M1 milestone | ✅ stable SDK | ✅ stable |
| BM25 / search libraries | ✅ Lucene (best-in-class) | ◐ minisearch/Orama adequate at this scale | ✅ rich |
| Retrieval/RAG ecosystem | ◐ | ◐ | ✅ richest (over-serves this corpus) |
| stdio server startup | ✗ JVM + Spring (seconds) | ✅ ~instant | ✅ fast |
| Migration cost | — (zero) | ~1–2 weeks, knowledge server only | similar + new toolchain |
| Keeps `searchOrders` thin REST client | ✅ | ✅ | ✅ |

**Bottom line:** finish Phase 1 in Java; the strongest migration case is **TypeScript for the knowledge server** (protocol velocity + startup + ecosystem match with MCP clients), decided in Phase 3 against eval parity — not as a leap of faith.

---

## 10. References

- **Model Context Protocol** — spec & SDKs: https://modelcontextprotocol.io (tools, resources, prompts; TS SDK is the reference implementation)
- **BM25** — Robertson & Zaragoza, *The Probabilistic Relevance Framework: BM25 and Beyond* (2009); Lucene `BM25Similarity` (default since Lucene 6)
- **Reciprocal Rank Fusion** — Cormack, Clarke & Buettcher, *Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods*, SIGIR 2009
- **Contextual Retrieval** — Anthropic engineering post, *Introducing Contextual Retrieval* (2024)
- **nomic-embed-text task prefixes** — Nomic AI model card (`search_query:` / `search_document:` instruction prefixes)
- **Apache Lucene** — `lucene-core` (BM25, HNSW vectors via `KnnFloatVectorField`, highlighting)
- **Spring AI MCP server** — Spring AI reference docs (tool/resource/prompt specifications, `MethodToolCallbackProvider`)
- Internal: `oms-knowledge-base/oms-knowledge-base-strategy.md`; `oms-mcp-server/docs/ARCHITECTURE.md` (current system); the golden query set in `oms-mcp-server/src/test/resources/retrieval-evals/golden-queries.yaml`. (`COPILOT_PROMPTS_LIBRARY.md` and `ARCHITECTURE_ANALYSIS.md` were consolidated away and removed.)

---

*This specification follows the OMS team manifesto: data-driven decision-making (eval harness before claims), simplicity and clarity (fewer tools, fewer services), and truthfulness about trade-offs (including where the fashionable option — rerankers, vector DBs — is the wrong one at this scale).*
