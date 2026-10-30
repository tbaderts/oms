# Design — SPEC-0011: Serve OKF concepts from MCP server

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

oms-mcp-server (`org.example.mcp`):

- `docs/DocumentRepository` walks the configured `domain.docs.paths` (`../oms-knowledge-base`),
  accepting `DocumentFileUtils.isDocFile` (`.md`, `.markdown`, `.txt`, `.adoc`). `listAll()` builds
  `DocMeta(path, name, size, lastModifiedIso, version, status, lastUpdated, category)` from
  `MarkdownParser.extractMetadata` (bold header lines in the first 20 lines). `readContent(path)`
  returns the raw file. `DocMeta` is also the JSON of `GET /api/kb/documents`
  (`kbexplorer/KbExplorerController`), which the KB explorer consumes.
- `index/SectionChunker.chunk(path, content)` splits by headings (`MarkdownParser.extractSections`),
  puts the text before the first heading into a preamble chunk (today: the YAML front matter), and
  copies `category`/`status`/`version` from the bold header into every `SectionChunk`.
- `index/KnowledgeIndexService` builds an in-memory Lucene index at startup (`rebuild()`):
  fields `body`, `title` (BM25, title boosted ×2), `vector` (KNN, Ollama embeddings, optional),
  filter fields `category_f`, `status_f`; `search(query, topK, category, status[, mode])` fuses BM25
  and vector ranks (RRF) and returns `SearchHit`s.
- `kb/KnowledgeBaseTools`: MCP tools `searchKnowledgeBase(query, topK, category, status)`,
  `readKnowledgeBase(path, anchor, offset, limit)`, `getKnowledgeBaseOverview()`; markdown output;
  `summarize()` skips paragraphs starting with `---`, `#`, `**`, …
- Tests: `DocumentRepositoryTest`, `MarkdownParserTest`, `SectionChunkerTest`,
  `KnowledgeIndexServiceTest`, `KnowledgeBaseToolsTest` (all with `@TempDir` bundles and BM25-only
  embeddings), `RetrievalEvalTest` (real `../oms-knowledge-base`, recall@5 ≥ 0.90, MRR only printed).
- SnakeYAML 2.6 is on the runtime classpath through Spring Boot.
- OKF rules followed: front matter between the first two `---` lines; reserved `index.md`/`log.md`;
  `status` default `stable`; trust tier from `verified` (`human:` actor ⇒ human-reviewed; only
  non-human ⇒ machine-confirmed; none ⇒ unverified; a single mapping = one-element list);
  `stale` ⇔ `now >= stale_after`; consumers tolerate broken links and unknown keys (OKF §5–§7, §11).
- Closest existing pattern: `MarkdownParser`/`MarkdownAnchors` (pure helpers in `docs/`, unit-tested)
  and `KnowledgeBaseToolsTest` (tool output asserted as markdown).

## Approach

```mermaid
flowchart LR
  F[file] --> FM[FrontMatter.parse] --> M[OkfMetadata.derive]
  F --> B[body with front matter blanked]
  M --> DR[DocumentRepository.listAll → DocMeta.okf]
  B --> SC[SectionChunker] --> KIS[KnowledgeIndexService<br/>type_f, tag_f, status_f]
  B --> LG[ConceptLinks<br/>outgoing + backlinks]
  DR & KIS & LG --> T[KnowledgeBaseTools] 
  DR --> REST[/api/kb/documents]
```

### New classes (package `org.example.mcp.docs`)

- **`FrontMatter`** (record + static `parse(String content)`): `Map<String,Object> data` (null when
  absent or unparseable), `boolean present`, `String error`, `int endLine` (1-based line of the
  closing `---`, 0 when absent), and `String blankedContent()` — the content with the front matter
  lines replaced by empty lines, so line numbers stay those of the file. Parsing uses SnakeYAML
  `new Yaml(new SafeConstructor(new LoaderOptions()))`; a non-mapping or a YAML error gives
  `present = true`, `data = null`, `error = message`. A leading BOM and `\r\n` are tolerated.
- **`OkfMetadata`** (record): `type, title, description, tags (List<String>), status,
  legacyStatus, version, updated, staleAfter, stale, trustTier, maturity, id, priority,
  implementation, capability`. Static `derive(FrontMatter fm, DocMetadata legacy, Instant now)`:
  - no front matter → only `status = legacy.status`, `version = legacy.version`,
    `legacyStatus = legacy.status`, `trustTier = "unverified"`, other fields null;
  - front matter → values from it (strings via `String.valueOf` for non-strings such as SnakeYAML
    dates/numbers; `tags` from a list or a single string); `status` = front matter `status` or
    `stable` if absent; `version` = front matter or legacy; `legacyStatus` = bold header value;
  - `trustTier` from `verified` (list or single mapping; any `by` starting with `human:` ⇒
    `human-reviewed`, otherwise ≥ 1 entry ⇒ `machine-confirmed`, none ⇒ `unverified`);
  - `stale` = `staleAfter` parses as an ISO instant and `!now.isBefore(staleAfter)`; unparseable ⇒ false.
  - Static `normalizeStatus(String)` maps legacy values for filtering: `active`, `complete`,
    `implementation complete` → `stable`; `draft`, `draft for discussion` → `draft`; others lower-cased.
- **`ConceptLinks`** (`@Component`, uses `DocumentRepository`): lazily builds and caches, for every
  document path, its outgoing links (markdown `[..](target)` outside fenced code and inline code,
  external schemes and pure anchors ignored, `#`/`?` stripped, `/x` = bundle root, otherwise
  relative to the document) as `Link(target, exists)`, and the inverse backlinks. `invalidate()` is
  called by `KnowledgeIndexService.rebuild()`. Same resolution rules as `tools/okf-check`.
- `DocumentFileUtils.isReserved(Path)` (`index.md`, `log.md`).

### Changed classes

- **`DocumentFileUtils.isDocFile`**: only `.md` / `.markdown` (OKF bundles are markdown;
  removes `.txt`/`.adoc`). `DocumentFileUtilsTest`, `DocumentRepositoryTest` updated accordingly.
- **`DocumentRepository.DocMeta`**: two components added — `boolean concept` (false for reserved
  files) and `OkfMetadata okf`; `status` becomes `okf.status()`. JSON of `/api/kb/documents` gains
  `concept` and an `okf` object (additive). `toMeta` parses front matter once per file.
  New `readBody(path)` = `FrontMatter.parse(readContent(path)).blankedContent()`.
- **`SectionChunk`**: `status` holds the OKF status; new components `type`, `tags`, `trustTier`.
  **`SectionChunker.chunk`** works on the blanked content (so `extractSections` cannot mistake a YAML
  comment for a heading and no YAML reaches a chunk) and replaces the preamble with a *metadata
  chunk* (anchor `""`, lines 1..`endLine`) whose text is `title`, `description` and `tags` (plus any
  real preamble text); omitted when there is no front matter and no preamble. Reserved files are not
  passed to the chunker (`KnowledgeIndexService.rebuild` skips them).
- **`KnowledgeIndexService`**: stores `type`, `trust` and the OKF `status`; filter fields `type_f`
  (lower-cased type), `tag_f` (one term per tag, lower-cased), `status_f` (normalised).
  `search(query, topK, category, status, type, tag[, mode])`; old 4/5-argument overloads delegate
  with nulls. `buildFilter` normalises `status` with `OkfMetadata.normalizeStatus`. `SearchHit`
  gains `type`, `trustTier`. `rebuild()` skips reserved files and calls `conceptLinks.invalidate()`.
- **`KnowledgeBaseTools`**:
  - `searchKnowledgeBase(query, topK, category, status, type, tag)`; description lists the new
    filters and OKF status values; each hit line shows `type · status · trust` when known.
  - `readKnowledgeBase` whole document: header block `**Type** … · **Status** … · **Trust** … ·
    **Stale** (if true) · **Tags** … · project keys`, the description, then the body without front
    matter (offset/limit apply to the body), then `### Links` (outgoing; broken ones marked
    "(broken)") and `### Cited by` (backlinks). Section reads (`anchor`) are unchanged apart from
    using the blanked content.
  - `getKnowledgeBaseOverview`: lists only concepts (`DocMeta.concept`), meta line
    `type · status · trust · stale · vVersion · size`, summary = `okf.description()` else
    `summarize(body)`.
- **`KbExplorerController`**: search endpoints accept optional `type`, `tag`; responses otherwise
  unchanged; `/documents` returns the extended `DocMeta`.
- **`RetrievalEvalTest`**: also asserts `MRR >= 0.80`. **`build.gradle`**: `test` task declares
  `../oms-knowledge-base` as an input directory, so a changed bundle re-runs the tests (fixes the
  stale-result issue seen in SPEC-0010), and `implementation 'org.yaml:snakeyaml'` makes the existing
  transitive dependency explicit (version from the Spring Boot BOM).

## Contract Changes

None in `oms-contracts`. The MCP tool `searchKnowledgeBase` gains two optional parameters (additive
for MCP clients). `GET /api/kb/documents` gains `concept` and `okf` fields (additive); for OKF
documents `status` carries the OKF value — observable change approved in the proposal, consumer
oms-kb-explorer adapts in SPEC-0012. `GET /api/kb/search/*` gain optional `type`, `tag` parameters.

## Data & Persistence

None — no database. The Lucene index is in memory and rebuilt at startup; the embedding cache
(`.kb-index`, keyed by content hash) re-embeds changed chunks once (the metadata chunks are new text).

## Events & Messaging

None — no Kafka.

## Domain, State & Orchestration

None — no order state or task pipeline.

## Alternatives & Decisions

- **SnakeYAML (`SafeConstructor`)** — already on the classpath (2.6 via Spring Boot), declared
  explicitly without a version. Rejected: Jackson 3 YAML (`tools.jackson.dataformat`, would be a new
  dependency); hand-written parsing (incorrect for real YAML).
- **Blank, not strip, front matter** — keeps chunk and section line numbers equal to file lines, so
  `readKnowledgeBase` line ranges and citations stay correct.
- **Metadata chunk instead of a separate Lucene field only** — title/description/tags become a chunk
  that is both BM25- and vector-searchable and citable as `path` (no anchor). Rejected: per-chunk
  copies of the description (would bias every section of a document towards the same text).
- **Nested `okf` object in `DocMeta`** — additive JSON, keeps the record readable. Rejected: 16
  more flat record components.
- **Extend the three tools, no new tools** — approved assumption; links appear in whole-document reads.
- **`ConceptLinks` cached and invalidated on rebuild** — the bundle only changes at restart today;
  computing per call would read every file on each read.
- **Only `.md`/`.markdown` are documents** — OKF bundles are markdown; removes noise
  (`partial_movie_file_list.txt`). Rejected: excluding only `animations/` (ad hoc).
- **Build changes** (P-17): `test` input on the knowledge base; explicit SnakeYAML declaration. No new
  artifact.
- **Changed at verify (independent review, NOT MET → fixed):**
  - *Overview* now shows the title in each heading and a second line with tags, maturity, id,
    priority, implementation, capability and updated (AC-1 requires them in the overview).
  - *YAML scalars*: a `Resolver` that only resolves booleans (`true`/`false` only, not YAML 1.1
    yes/no/on/off — re-review finding), nulls and merge keys implicitly, so
    numbers and dates keep their written text (`1.10`, `2026-02-14`), like the JSON schema in
    `tools/okf-check`; a date-only `stale_after` means midnight UTC.
  - *Metadata chunk* is built separately and prepended after `mergeTiny`/`splitOversized`; merged
    into a section, its synthetic text shifted the line ranges of split parts.
  - *Links*: any existing file is a valid target (not only `.md`), a folder resolves to its
    `index.md`, a link leaving the bundle is broken, and `index.md`/`log.md` are not backlink
    sources ("cited by" lists citations, not navigation) — the same rules as `tools/okf-check`.
  - *`ConceptLinks` caching*: built lazily on first use under the object lock and published through a
    volatile field; `invalidate()` takes the same lock, so a build in progress cannot republish a
    graph that was invalidated meanwhile (the first draft said "rebuilt inside `rebuild()`").
  - *REST*: `/documents/sections` uses the body (front matter blanked); `type`/`tag` filters on all
    three search endpoints; a `WebTestClient` test pins the `/api/kb/documents` JSON.
  - *Search hits* state the trust tier for every document, including legacy ones.
  - *MCP resources* (`kb://`) deliberately keep serving the raw file, front matter included, and
    include `index.md`/`log.md`: a resource is the document as stored, which OKF-aware clients want;
    the tools are where concepts are curated.

## Risks & Mitigations

- **Retrieval regression** from metadata chunks or filters → AC-7 guard (`RetrievalEvalTest`
  recall@5 ≥ 0.90, MRR ≥ 0.80), now re-run whenever the bundle changes.
- **SnakeYAML timestamp/number coercion** (`1.0` → Double, unquoted dates → `Date`) → values are
  stringified; tests cover a numeric `version` and a `Date`.
- **Malformed front matter** in third-party bundles → caught, document listed with `okf` fields null
  and `error` logged at debug; covered by a test (AC-1).
- **Explorer shows OKF status values** before SPEC-0012 → legacy value still in `okf.legacyStatus`;
  approved observable change.
- **Large bundles and link graph memory** → ~150 documents today; links stored as path strings.

## Test Strategy

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit + web | `docs/OkfMetadataTest#derivesFieldsFromFrontMatter`, `#fallsBackToLegacyHeaderWithoutFrontMatter`, `#toleratesUnparseableFrontMatter`, `#stringifiesNumbersAndDates`; `docs/FrontMatterTest#parsesAndBlanksKeepingLineCount`; `docs/DocumentRepositoryTest#listsOkfMetadataAndLegacyMetadata`; `kb/KnowledgeBaseToolsTest#overviewListsConceptsOnly`; `kbexplorer/KbExplorerControllerTest#documentsCarryOkfMetadataAndConceptFlag` | all keys returned in the listing, the overview and the JSON; legacy path unchanged; malformed YAML → listed, okf fields null, no exception |
| AC-2 | unit | `OkfMetadataTest#trustTierFromVerified` (none / machine / human / single mapping), `#staleExactlyFromStaleAfter` (before, equal, after, unparseable) | tier and stale rules |
| AC-3 | integration (in-memory index) | `index/KnowledgeIndexServiceTest#filtersByTypeTagAndStatus`, `#mapsLegacyStatusFilter`; `kb/KnowledgeBaseToolsTest#searchHitsShowTypeStatusAndTrust` | only matching documents; Active/Complete/Draft mapped; hit line content |
| AC-4 | unit + integration | `index/SectionChunkerTest#noFrontMatterInChunksAndMetadataChunkFirst`; `KnowledgeIndexServiceTest#frontMatterKeysAreNotSearchableButDescriptionIs` | no chunk contains `---`/YAML keys; search for a `repo:` source term finds nothing, for a description-only term finds the document |
| AC-5 | integration | `KnowledgeBaseToolsTest#wholeReadShowsMetadataLinksAndBacklinks`, `#brokenLinksAreListedNotFatal`; `docs/ConceptLinksTest#resolvesRelativeRootAndIgnoresCodeAndExternal` | header instead of YAML; outgoing and cited-by paths; broken marked |
| AC-6 | unit + integration | `DocumentRepositoryTest#onlyMarkdownAndReservedFlagged`; `KnowledgeIndexServiceTest#reservedFilesAreNotSearchable`; `KnowledgeBaseToolsTest#overviewListsConceptsOnly`, `#reservedFilesStayReadable` | `.txt` not listed; index/log `concept=false`, never hits, readable |
| AC-7 | integration (real bundle) | `index/RetrievalEvalTest#recallAt5AndMrrMeetBaseline` | recall@5 ≥ 0.90 and MRR ≥ 0.80 |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | no OpenAPI/Avro change; `/api/kb` is not a contract module API |
| P-02 | Specification before code, generated models only | n/a | no contract-backed models touched |
| P-03 | Never edit generated code | comply | nothing under `build/generated*` |
| P-04 | Contracts evolve compatibly | comply | REST and MCP changes are additive; the `status` value change for OKF documents was declared in the proposal with the consumer (SPEC-0012) |
| P-05 | Every state change is recorded in the event log | n/a | no order state |
| P-06 | Kafka only through the transactional outbox | n/a | no Kafka |
| P-07 | Schema changes through new Liquibase changesets | n/a | no database |
| P-08 | Concurrency and idempotency are explicit | comply | index snapshots stay immutable and swapped atomically; `ConceptLinks` cache is rebuilt under the same `synchronized rebuild()` call and published via a volatile reference |
| P-09 | Commands and queries stay separate | n/a | read-only service |
| P-10 | State transitions go through the state machine and task pipeline | n/a | no state transitions |
| P-11 | Layering and conventions | comply | pure helpers in `docs/` like `MarkdownParser`; constructor injection; Lombok `@Slf4j` |
| P-12 | Jackson 3 only | comply | no Jackson 2 import added; YAML via SnakeYAML |
| P-13 | Errors and validation follow the framework specs | comply | malformed front matter tolerated and logged, never swallowed silently; tool errors stay markdown messages as today |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | test per AC above, written first |
| P-15 | Observability | comply | SLF4J debug/info logs for parse failures and rebuild stats; no `System.out` |
| P-16 | Security | comply | SafeConstructor (no arbitrary object construction from YAML); link resolution never reads outside configured base directories |
| P-17 | Simplicity and dependencies | comply | no new artifact; explicit declaration of the existing SnakeYAML; build input change recorded above |
| P-18 | Modules build standalone | comply | `cd oms-mcp-server && ./gradlew check` |
| P-19 | Documentation follows behaviour | comply | knowledge-services capability, mcp-server component, FR-033, oms-mcp-server README updated |

## Knowledge Base Updates

- `capabilities/knowledge-services.md`: remove the "does not use OKF metadata" gap; describe filters,
  metadata and links; add a requirement `FR-045` for OKF-aware knowledge tools (implemented, with
  sources and tests).
- `architecture/mcp-server.md`: mention front matter parsing and the link graph.
- `functional-requirements/FR-033-serve-knowledge-base.md`: tools' new behaviour.
- `oms-mcp-server/README.md`: tool parameters and the `okf` fields of `/api/kb/documents`.
- `log.md`: entry.
