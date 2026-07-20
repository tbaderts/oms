# OMS MCP Knowledge Server

A **Model Context Protocol (MCP)** server built with Spring Boot and Spring AI that makes the OMS domain knowledge base available to coding agents (Claude Code, GitHub Copilot, Claude Desktop, Cursor), plus query access to the running OMS.

Built as a **blueprint**: the same architecture is designed to scale to knowledge bases with hundreds of specifications.

---

## What It Provides

**1. Hybrid knowledge search (embedded, zero external services required)**
- **BM25 keyword search** via embedded Apache Lucene (tokenization, stemming, IDF weighting, length normalization)
- **Semantic vector search** via local Ollama embeddings + Lucene HNSW (optional — degrades gracefully to BM25-only)
- **Reciprocal Rank Fusion (RRF)** combines both rankings — no score-comparability tricks, no weights to tune
- **Section-granular indexing**: markdown-structure-aware chunks with heading breadcrumbs; every search hit carries a stable citation (`path#anchor`, line range)

**2. Three consolidated MCP tools** (replacing eight overlapping predecessors)

| Tool | Purpose |
|---|---|
| `getKnowledgeBaseOverview` | Orientation: every doc with metadata, summary, and section anchors. Call once per session. |
| `searchKnowledgeBase(query, topK?, category?, status?)` | One search entry point. Hybrid by default. Returns markdown with citations. |
| `readKnowledgeBase(path, anchor?, offset?, limit?)` | Read a whole doc (with section outline) or a single cited section. |

**3. MCP resources & prompts**
- Every KB document is exposed as an MCP **resource** (`kb://<path>`) — attach a spec directly to a conversation
- MCP **prompts** encode the team's spec-driven workflow: `implement-from-spec`, `validate-against-spec`

**4. OMS query integration**
- `searchOrders` — typed filters, pagination, sorting against the oms-core REST API

---

## Architecture

```
MCP Client (Claude Code / Copilot / Claude Desktop)
        │  stdio / JSON-RPC
        ▼
oms-mcp-server (Spring Boot, Spring AI 2.0)
        │
        ├── KnowledgeBaseTools ──► Embedded Lucene index (in-memory)
        │        search/read/overview     │  BM25 + HNSW vectors + RRF fusion
        │                                 │  section chunks w/ breadcrumbs + citations
        │                                 ▼
        │                          oms-knowledge-base/*.md
        │
        ├── EmbeddingService ─────► Ollama (localhost:11434, optional)
        │        content-hash disk cache: only new/changed sections are embedded
        │
        ├── OrderSearchMcpTools ──► oms-core REST API (:8090)
        └── MCP resources (kb://…) + prompts
```

How it works in depth (for agent users and maintainers): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Design rationale, alternatives, and the improvement roadmap: [docs/ARCHITECTURE_IMPROVEMENTS_SPEC.md](docs/ARCHITECTURE_IMPROVEMENTS_SPEC.md).

### Key Properties

- **No Docker, no vector database, no external search service.** The whole index lives in process memory and rebuilds in well under a second for the current KB; embeddings are cached on disk (`.kb-index/`) keyed by content hash, so restarts only embed changed sections.
- **Graceful degradation.** Without Ollama, search silently runs BM25-only — which already achieves recall@5 = 1.0 on the golden query set.
- **Measured, not guessed.** A retrieval eval harness (25 golden queries, recall@5 + MRR) runs with the normal test suite and fails the build on regression.

---

## Prerequisites

- **Java 25** (Gradle toolchain resolves it)
- **Ollama** (optional, for semantic search): install from https://ollama.com, then
  ```bash
  ollama pull mxbai-embed-large
  ```
- **oms-core** running on :8090 (optional, only for `searchOrders`)

## Quick Start

```powershell
# Windows
.\run-mcp.ps1

# Linux/macOS
./run-mcp.sh
```

This builds the jar and starts the server over stdio. Register it in your MCP client:

**Claude Code / Claude Desktop** (`.mcp.json` / `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "oms-knowledge": {
      "command": "C:\\data\\workspace\\oms\\oms-mcp-server\\run-mcp.ps1"
    }
  }
}
```

**VS Code / Copilot** (`.vscode/mcp.json`):
```json
{
  "servers": {
    "oms-knowledge": {
      "type": "stdio",
      "command": "${workspaceFolder}/oms-mcp-server/run-mcp.ps1"
    }
  }
}
```

See [docs/QUICK_START_GUIDE.md](docs/QUICK_START_GUIDE.md) for details.

## Configuration

All settings in `src/main/resources/application.yml`:

```yaml
domain:
  docs:
    paths: ${DOMAIN_DOCS_PATHS:../oms-knowledge-base}   # comma-separated KB roots

knowledge:
  index:
    cache-dir: .kb-index          # persistent embedding cache
    min-section-chars: 200        # merge smaller sections with a neighbor
    max-section-chars: 6000       # split larger sections at paragraph boundaries
    embeddings:
      enabled: true               # false = BM25-only, no Ollama needed
      query-prefix: "Represent this sentence for searching relevant passages: "
      document-prefix: ""

spring:
  ai:
    ollama:
      base-url: http://localhost:11434
      embedding:
        options:
          model: mxbai-embed-large
```

**Changing the embedding model:** retrieval-tuned models are trained with instruction prefixes — set them to match the model:

| Model | query-prefix | document-prefix |
|---|---|---|
| `mxbai-embed-large` (default) | `Represent this sentence for searching relevant passages: ` | _(none)_ |
| `nomic-embed-text` | `search_query: ` | `search_document: ` |
| `bge-m3` | _(none)_ | _(none)_ |
| `snowflake-arctic-embed2` | `query: ` | _(none)_ |

The embedding cache is per-model; switching models triggers a one-time re-embed.

## Profiles

| Profile | Purpose |
|---|---|
| _(default)_ | MCP server over stdio, no web server |
| `local` | Adds the REST API on :8091 for the oms-kb-explorer web app (`/api/kb/...`) |

## Testing & Retrieval Evaluation

```bash
./gradlew test
```

Includes a **retrieval eval** (`RetrievalEvalTest`): 25 golden queries against the real knowledge base, computing document-level recall@5 and MRR for BM25-only retrieval (CI-safe, no Ollama). The build fails if recall@5 drops below the pinned baseline.

Current numbers (2026-06-10): **recall@5 = 1.000, MRR = 0.903**.

When you change anything retrieval-related (analyzer, chunking, fusion, embedding model), re-run the eval and update the baseline in `RetrievalEvalTest` — improvements raise it, regressions block the build.

## Development

Add a new tool: annotate a method with `@Tool` in a `@Component` and register the class in `McpConfig`. Parameter names are preserved via the `-parameters` compiler flag.

Key packages:
- `org.example.mcp.index` — Lucene index, section chunker, embeddings, RRF
- `org.example.mcp.kb` — the three MCP tools, resources, prompts
- `org.example.mcp.docs` — document repository, markdown parsing, anchors
- `org.example.mcp.oms` — OMS query client + tool
- `org.example.mcp.kbexplorer` — REST API for the KB explorer UI (`local` profile)

## Documentation

| Document | Content |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | **How it works, and how agents use it — start here** |
| [docs/QUICK_START_GUIDE.md](docs/QUICK_START_GUIDE.md) | 5-minute setup |
| [docs/MCP.md](docs/MCP.md) | Client setup (Claude Code / Copilot / Claude Desktop) + troubleshooting |
| [docs/QUICK_REFERENCE.md](docs/QUICK_REFERENCE.md) | One-page cheat sheet |
| [docs/COPILOT_KNOWLEDGE_INTEGRATION_GUIDE.md](docs/COPILOT_KNOWLEDGE_INTEGRATION_GUIDE.md) | Spec-driven prompt patterns for Copilot |
| [docs/ARCHITECTURE_IMPROVEMENTS_SPEC.md](docs/ARCHITECTURE_IMPROVEMENTS_SPEC.md) | Design decisions, trade-offs and roadmap |
