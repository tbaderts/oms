# Proposal — SPEC-0011: Serve OKF concepts from MCP server

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The goal asks for the MCP server to "support use OKF". SPEC-0009 made the knowledge base an OKF
v0.2 bundle and SPEC-0010 filled it with typed concepts (capabilities, requirements with
implementation status, domain, interfaces, architecture). The MCP server — the way AI assistants
read the knowledge base — ignores all of it today:

- **Metadata comes from the old bold header only.** `MarkdownParser.extractMetadata` reads
  `**Version:**` / `**Status:**` in the first 20 lines. The 100 new SPEC-0010 documents have no bold
  header, so `getKnowledgeBaseOverview` shows them with no status at all, and `searchKnowledgeBase`'s
  `status` filter only knows the legacy values (`Active`, `Complete`, `Draft`).
- **Front matter is indexed as text.** `SectionChunker` puts the YAML block into each document's
  first chunk, so searches match `generated: claude-code…`, `repo:` paths and tag lists rather than
  content, and every document's first excerpt starts with YAML.
- **No type, tags, trust or staleness.** An agent cannot ask for "capabilities that are planned" or
  "requirements that are implemented", cannot tell a human-reviewed document from a machine draft,
  and cannot see `stale_after`.
- **No links.** Concepts link to each other (capability ↔ requirement ↔ interface ↔ spec), but the
  tools return no outgoing links or backlinks, so agents cannot navigate the graph.
- **Reserved and non-markdown files are treated as documents.** `index.md` and `log.md` (navigation,
  not concepts) and `animations/media/**/partial_movie_file_list.txt` appear in the overview and in
  search results.
- The KB explorer (SPEC-0012) reads the same `DocMeta` over `/api/kb/documents`, so it cannot show
  any of this either.

Cost of doing nothing: agents keep treating machine drafts, planned capabilities and stale specs as
current truth — exactly the confusion SPEC-0010 set out to remove — and the explorer ticket has no
data to build on.

## What Changes

- The server parses each document's YAML front matter and derives OKF metadata: `type`, `title`,
  `description`, `tags`, `status` (`draft` | `stable` | `deprecated`), `version`, `updated`,
  `stale_after` → `stale`, trust tier (`unverified` | `machine-confirmed` | `human-reviewed`, from
  `verified`), and the project keys (`maturity`, `id`, `priority`, `implementation`, `capability`).
  Documents without front matter keep today's bold-header metadata.
- `searchKnowledgeBase` gains optional `type` and `tag` filters; its `status` filter accepts the OKF
  values and maps the legacy ones (`Active`/`Complete` → `stable`, `Draft` → `draft`). Each hit shows
  type, status and trust tier.
- Front matter is no longer indexed as body text; `title`, `description` and `tags` are indexed as
  searchable fields instead.
- `readKnowledgeBase` (whole document) starts with a metadata summary instead of the raw YAML, and
  lists the concept's outgoing links and backlinks ("cited by").
- `getKnowledgeBaseOverview` shows type, status, trust tier and staleness per document, uses the
  front matter `description` as the summary, and leaves out reserved files (`index.md`, `log.md`).
- Only markdown files under the bundle are documents; `index.md` / `log.md` are readable but not
  indexed for search.
- The REST API `/api/kb/documents` (used by the KB explorer) returns the same OKF metadata as
  additional JSON fields.

**Observable change, not breaking for the contract**: for OKF documents the `status` value moves
from the legacy header value (e.g. `Active`) to the OKF value (`stable`); the legacy value stays
available. The MCP tools are not part of the OpenAPI/Avro contracts; the REST response change is
additive. Consumers: AI assistants (tool text), the KB explorer (adapts in SPEC-0012).

## Scope

### In scope

- Front matter parsing and OKF metadata derivation in oms-mcp-server.
- Changes to the three MCP knowledge tools and the `/api/kb/documents` REST response.
- Indexing changes (no YAML in chunks, metadata fields, type/tag/status filters, reserved files).
- Link extraction (outgoing links and backlinks) across the bundle.
- Tests, including the existing retrieval evaluation as a non-regression guard.

### Out of scope

- KB explorer UI changes (SPEC-0012).
- New MCP tools beyond the existing three (links and metadata are added to the existing tools).
- Writing to the knowledge base, `verified` workflows, or OKF Attested Computations.
- Live re-indexing on file change (the index is still built at startup).
- Changes to the bundle content or the checker.

## Acceptance Criteria

- **AC-1** — Given a document with OKF front matter, when it is listed (`getKnowledgeBaseOverview`
  and `GET /api/kb/documents`), then its `type`, `title`, `description`, `tags`, `status`,
  `version`, `updated` and project keys (`maturity`, `id`, `priority`, `implementation`,
  `capability`) are returned as in the front matter; given a document without front matter, its
  version and status come from the bold header exactly as before; given unparseable front matter,
  the document is still listed with null OKF fields and the server does not fail.
- **AC-2** — Given `verified` entries and `stale_after`, when a document is listed, then its trust
  tier is `unverified` with no `verified`, `machine-confirmed` when all actors are non-`human:`,
  `human-reviewed` when any actor is `human:` (a single mapping counts as a one-element list), and
  `stale` is true exactly when `now >= stale_after`.
- **AC-3** — Given an indexed bundle, when `searchKnowledgeBase` is called with `type`, `tag` and/or
  `status` filters, then only sections of documents matching all given filters are returned; legacy
  status values `Active`/`Complete`/`Draft` filter as `stable`/`stable`/`draft`; each hit states the
  document's type, status and trust tier.
- **AC-4** — Given documents with front matter, when they are indexed, then no chunk text contains
  the front matter block (a search for a term that appears only in front matter keys or `repo:`
  sources finds no body match), while a search for a term that appears only in a document's
  `title`, `description` or `tags` returns that document.
- **AC-5** — Given a concept that links to other concepts and is linked from others, when it is read
  whole with `readKnowledgeBase`, then the response starts with its metadata summary (not raw YAML)
  and lists its outgoing links and its backlinks as bundle paths; links to missing files are listed
  as broken without an error.
- **AC-6** — Given a bundle containing `index.md`, `log.md` and non-markdown files, when the overview
  is built and the index is searched, then `index.md`/`log.md` and non-markdown files are not
  listed as concepts and never returned as search hits, while `index.md`/`log.md` remain readable
  with `readKnowledgeBase`.
- **AC-7** — Given the real `oms-knowledge-base`, when `RetrievalEvalTest` runs, then recall@5 is at
  least 0.90 (the pinned baseline) and MRR at least 0.80.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-mcp-server |
| Contracts (OpenAPI / Avro) | none (MCP tools and `/api/kb` are not in oms-contracts) |
| Data (tables, migrations) | none; the on-disk Lucene index / embedding cache is rebuilt at startup |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | AI assistants via MCP (richer tool output, two new optional search parameters); oms-kb-explorer via `/api/kb/documents` (additional JSON fields; status values of OKF documents change from legacy to OKF — adapted in SPEC-0012) |
| Knowledge base | `capabilities/knowledge-services.md` and `architecture/mcp-server.md`: gap "does not use OKF metadata" resolved; `oms-methodolgy/ai-augmented-development.md` tool descriptions if they list parameters |

## Open Questions

- [resolved] Keep the legacy `status` value for OKF documents? → assumption: `status` becomes the
  OKF value; the legacy header value is kept in a separate `legacyStatus` field, and the search filter
  maps legacy inputs. Cheap to reverse.
- [resolved] Add new MCP tools (e.g. `getRelatedConcepts`) or extend the existing three? →
  assumption: extend the existing three, keeping the deliberately small tool surface described in
  `KnowledgeBaseTools`.
- [resolved] Should `index.md` / `log.md` be searchable? → assumption: no (OKF reserves them for
  navigation; their bullet lists duplicate concept descriptions and would crowd results); they stay
  readable.
- [resolved] YAML parser → assumption: SnakeYAML, already on the classpath via Spring Boot; to be
  confirmed in design (no new dependency if it is).
- [deferred] Re-index on file change → startup indexing is unchanged; a watcher can follow.
