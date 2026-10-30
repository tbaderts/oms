# Verification — SPEC-0011: Serve OKF concepts from MCP server

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Evidence run after the last code change (T-13, 2026-10-28): `cd oms-mcp-server &&
./gradlew check --rerun-tasks` → 118 tests, 0 failures, 0 skipped (all suites executed, none
cached); `spec verify` at 2026-10-28T05:41:53Z → `./gradlew check` exit 0
(`evidence/oms-mcp-server-1.log`). Knowledge base: `node tools/okf-check/okf-check.mjs
oms-knowledge-base` → 134 concepts, 0 errors; `npm test` in `tools/okf-check` → 21/21.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | OKF metadata in overview and `/api/kb/documents`; legacy header unchanged; broken YAML tolerated | `OkfMetadataTest` (10: derivation, defaults, legacy fallback, unparseable, scalars kept as written, only `true`/`false` booleans), `FrontMatterTest` (5), `DocumentRepositoryTest$ListAll#listsOkfMetadataAndLegacyMetadata`, `#listsDocumentsWithBrokenFrontMatter`, `KnowledgeBaseToolsTest#overviewListsConceptsOnly` (title heading, tags, maturity, id, priority, implementation, capability, updated), `KbExplorerControllerTest#documentsCarryOkfMetadataAndConceptFlag` (JSON `status`, `concept`, `okf.{type,title,tags,legacyStatus,trustTier,stale,maturity}`, legacy `status`/`version`) | PASS |
| AC-2 | Trust tier and staleness rules | `OkfMetadataTest#trustTierFromVerified` (none, machine, mixed with `human:`, single mapping), `#staleExactlyFromStaleAfter` (before, equal, offset, unparseable), `#dateOnlyStaleAfterMeansMidnightUtc`; JSON `okf.stale` in `KbExplorerControllerTest` | PASS |
| AC-3 | `type`/`tag`/`status` filters, legacy status mapping, hits state type/status/trust | `KnowledgeIndexServiceTest#filtersByTypeTagAndStatus`, `#mapsLegacyStatusFilter` (Active, Complete, Draft, Draft for discussion through the index; non-empty asserted), `KnowledgeBaseToolsTest#searchHitsShowTypeStatusAndTrust`, `#legacyHitsStateTrustTier`, `KbExplorerControllerTest#searchEndpointsFilterByTypeAndTag` | PASS |
| AC-4 | No front matter in chunks; title/description/tags searchable | `SectionChunkerTest#noFrontMatterInChunksAndMetadataChunkFirst` (production chunk sizes), `#splitPartsOfFrontMatterDocumentsCiteFileLines`, `KnowledgeIndexServiceTest#frontMatterKeysAreNotSearchableButDescriptionIs` (`repo:` term and actor not found; description-, title- and tag-only terms found) | PASS |
| AC-5 | Whole read: metadata first, outgoing links, backlinks, broken links listed | `KnowledgeBaseToolsTest#wholeReadShowsMetadataLinksAndBacklinks` (header immediately after the path line, no YAML, links, cited-by without navigation files), `#brokenLinksAreListedNotFatal`, `ConceptLinksTest` (5: relative/root/folder/code/external, backlinks, invalidation, non-markdown targets, links leaving the bundle) | PASS |
| AC-6 | `index.md`/`log.md`/non-markdown not concepts, never hits, still readable | `DocumentRepositoryTest$ListAll#onlyMarkdownAndReservedFlagged`, `DocumentFileUtilsTest` (15), `KnowledgeIndexServiceTest#reservedFilesAreNotSearchable`, `KnowledgeBaseToolsTest#overviewListsConceptsOnly`, `#reservedFilesStayReadable` (index.md and log.md), JSON `concept: false` for index.md | PASS |
| AC-7 | Real bundle: recall@5 ≥ 0.90, MRR ≥ 0.80 | `RetrievalEvalTest#recallAt5AndMrrMeetBaseline` (now asserts MRR), forced re-run 2026-10-28 06:42 local after the last change: 134 documents, 25 queries, recall@5 0.960, MRR 0.828 (values from the test log) | PASS |

## Goal Assessment

The scope note asks the MCP server to "read the OKF bundle and expose concept type, tags, status,
staleness, trust tier and links through its knowledge tools". All of these now reach agents:

- `getKnowledgeBaseOverview`: per concept the title, type, status, trust tier, staleness, version,
  tags and the project keys (maturity, id, priority, implementation, capability, updated) — an agent
  can see from the overview which capabilities are planned and which requirements are implemented,
  the use case that motivated the ticket.
- `searchKnowledgeBase`: filters by type, tag and status; every hit states type, status and trust.
- `readKnowledgeBase`: metadata header (including staleness), body without YAML, outgoing links
  (broken ones marked) and "cited by".
- `/api/kb/documents` gives the KB explorer the same metadata (`okf`, `concept`) for SPEC-0012.

Retrieval quality is unchanged on the real bundle. Remaining gaps, none material:
- Search hits do not repeat staleness (it is in the overview and whole reads).
- MCP `kb://` resources serve the raw file including front matter, by design (see design.md).
- The index is still built at startup only (deferred in the proposal).

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | no OpenAPI/Avro change |
| P-02 | Specification before code, generated models only | N/A | no contract-backed models |
| P-03 | Never edit generated code | PASS | nothing under `build/generated*` |
| P-04 | Contracts evolve compatibly | PASS | MCP tool parameters and REST fields/params additive; `status` value change for OKF documents declared in the proposal, `legacyStatus` kept (asserted in `KbExplorerControllerTest`) |
| P-05 | Every state change is recorded in the event log | N/A | no order state |
| P-06 | Kafka only through the transactional outbox | N/A | no Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | no database |
| P-08 | Concurrency and idempotency are explicit | PASS | index snapshot swap unchanged; `ConceptLinks` built lazily under its lock, published via volatile, `invalidate()` synchronized with the build (design updated) |
| P-09 | Commands and queries stay separate | N/A | read-only service |
| P-10 | State transitions go through the state machine and task pipeline | N/A | none |
| P-11 | Layering and conventions | PASS | pure helpers in `docs/`, constructor injection, `@Slf4j` |
| P-12 | Jackson 3 only | PASS | no Jackson 2 imports added; YAML via SnakeYAML |
| P-13 | Errors and validation follow the framework specs | PASS | malformed front matter tolerated and logged at debug; tool errors remain markdown messages |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | every AC has passing tests above; review gaps (overview keys, JSON, title/tag search, Draft filter) closed with tests written red first |
| P-15 | Observability | PASS | SLF4J only; link-graph build and parse failures logged |
| P-16 | Security | PASS | SnakeYAML `SafeConstructor` with default `LoaderOptions` (alias limits); link existence only via `resolveAgainstBases` (base-directory guard); links leaving the bundle reported broken |
| P-17 | Simplicity and dependencies | PASS | no new artifact; explicit SnakeYAML declaration and the `test` input on the knowledge base recorded in design.md (R10 warning acknowledged) |
| P-18 | Modules build standalone | PASS | `./gradlew check` in oms-mcp-server, exit 0 |
| P-19 | Documentation follows behaviour | PASS | README (tools, OKF), knowledge-services capability, FR-045, FR-033, mcp-server component, log entry |

## Independent Review

The spec-reviewer agent reviewed twice (the first run was interrupted by a rate limit and resumed).

**First review: NOT MET.** Implement was reopened (T-12) and every finding resolved:

| # | Finding (severity) | Resolution |
|---|---|---|
| 1 | Overview lacks title, tags, updated and project keys required by AC-1 (blocking) | Fixed: title in each heading, second line with tags, maturity, id, priority, implementation, capability, updated; asserted |
| 2 | No test of the `/api/kb/documents` JSON (major) | Fixed: `KbExplorerControllerTest` (WebTestClient) for documents, sections and search filters |
| 3 | Metadata chunk merged into sections shifts line ranges of split parts (minor) | Fixed: metadata chunk built separately; test with production chunk sizes |
| 4 | SnakeYAML coerces numbers/dates (`1.10` → `1.1`); date-only `stale_after` never stale (minor) | Fixed: text-preserving resolver; date-only = midnight UTC; tests |
| 5 | Non-`.md` targets reported broken under a fabricated `index.md` path (minor) | Fixed: any existing file is valid; folders → `index.md` |
| 6 | Links leaving the bundle could match an in-bundle file (minor) | Fixed: reported broken with their normalised path; test |
| 7 | `kb://` resources and `/documents/read` raw; `/documents/sections` on raw content (minor) | Sections fixed (`readBody`); raw resources and read kept by decision (design.md) |
| 8 | `type`/`tag` only on the keyword endpoint (minor) | Fixed on semantic and hybrid; tested |
| 9 | Trust tier missing on hits of documents without `type`; no staleness in hits (minor) | Trust tier always shown (tested); staleness in hits → follow-up |
| 10 | `index.md` counted as a citation in "cited by" (minor) | Fixed: reserved files are not backlink sources; tested |
| P-08 | Design described a different caching; `invalidate()` could race a build | Fixed: `invalidate()` synchronized with the build; design corrected |
| P-14 | Weak assertions (empty `allMatch`, no title/tag-only search, Draft only at unit level, log.md untested) | Fixed: `assertOnly`, title-only and tag-only searches, Draft through the index, log.md tool tests |

**Re-review: MET.** All ACs proven by the reviewer's own forced run (117 tests). Remaining minor findings:

| # | Finding | Resolution |
|---|---|---|
| 1 | YAML 1.1 booleans (`yes`/`no`/`on`/`off`) differ from the checker's JSON schema | Fixed (T-13): only `true`/`false` are booleans; test `onlyTrueAndFalseAreBooleans`; 118 tests pass |
| 2 | Search hits do not show staleness | Accepted as follow-up (overview and whole reads show it; not a material goal gap per the reviewer) |
| 3 | `kb://` resources raw with front matter, include index/log | Accepted design decision, recorded in design.md |

## Automated Evidence

- `evidence/last-run.json`: 2026-10-28T05:41:53Z, result `pass`, modules `oms-mcp-server`,
  `oms-knowledge-base`; policy check PASS with one warning (R10, build change — recorded in the
  design); `./gradlew check` exit 0 (`evidence/oms-mcp-server-1.log`; up to date after the forced
  run below, same inputs).
- Forced full run `./gradlew check --rerun-tasks` after the last change: 118 tests in 23 suites,
  0 failures, 0 skipped.
- `RetrievalEvalTest` forced re-run: recall@5 0.960, MRR 0.828, 134 documents (reserved and
  non-markdown files no longer indexed: 151 → 134).
- Knowledge base checker: 134 concepts, 0 errors; checker tests 21/21.

## Follow-ups

- SPEC-0012: the KB explorer can now use `okf` and `concept` from `/api/kb/documents`, the
  `filterType`/`filterTag` search parameters and the body-based sections.
- Optional: staleness in search hits; re-index on file change.
- Consider whether `kb://` resources should offer a body-only variant.

## Verdict

Verdict: GOAL MET
