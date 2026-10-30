# Tasks — SPEC-0011: Serve OKF concepts from MCP server

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order:
>
> 1. Contracts (oms-contracts) and regeneration
> 2. Migration (new Liquibase changelog)
> 3. Behaviour, one task per AC or slice: write the failing test, implement, make it green
> 4. Wiring: API, messaging, configuration
> 5. Observability (logs, metrics)
> 6. Knowledge base and docs
> 7. Full verification (`spec verify`)
>
> Format, which the gate parses:
>
> ```
> - [ ] **T-1** Imperative summary (AC-1, AC-2)
>   - files: path/one.java, path/two.yaml
>   - verify: `./gradlew test --tests 'org.example.oms…SomeTest'` passes
> ```
>
> Every AC must be covered by at least one task, and every task needs a `verify:` line. Tasks may
> be added during implementation; record why under Notes.

## Tasks

- [x] **T-1** Build: declare `org.yaml:snakeyaml` explicitly and the knowledge base as `test` input (AC-7)
  - files: oms-mcp-server/build.gradle
  - verify: `cd oms-mcp-server && ./gradlew compileJava` passes
- [x] **T-2** Test-first `FrontMatterTest` and `OkfMetadataTest`; implement `FrontMatter` and `OkfMetadata` (AC-1, AC-2)
  - files: oms-mcp-server/src/main/java/org/example/mcp/docs/FrontMatter.java, .../docs/OkfMetadata.java, oms-mcp-server/src/test/java/org/example/mcp/docs/FrontMatterTest.java, .../docs/OkfMetadataTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.docs.FrontMatterTest' --tests 'org.example.mcp.docs.OkfMetadataTest'` passes
- [x] **T-3** Test-first: `DocumentRepositoryTest` (OKF + legacy metadata, only markdown, reserved flagged); extend `DocMeta` with `concept`, `okf`; `isDocFile` markdown only; `isReserved`; `readBody` (AC-1, AC-6)
  - files: oms-mcp-server/src/main/java/org/example/mcp/docs/DocumentRepository.java, .../docs/DocumentFileUtils.java, oms-mcp-server/src/test/java/org/example/mcp/docs/DocumentRepositoryTest.java, .../docs/DocumentFileUtilsTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.docs.*'` passes
- [x] **T-4** Test-first `SectionChunkerTest#noFrontMatterInChunksAndMetadataChunkFirst`; chunk blanked content, metadata chunk, `SectionChunk` type/tags/trust (AC-4)
  - files: oms-mcp-server/src/main/java/org/example/mcp/index/SectionChunker.java, .../index/SectionChunk.java, oms-mcp-server/src/test/java/org/example/mcp/index/SectionChunkerTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.index.SectionChunkerTest'` passes
- [x] **T-5** Test-first `KnowledgeIndexServiceTest` (type/tag/status filters, legacy status mapping, front matter not searchable, description searchable, reserved files not searchable); implement filter fields, search overloads, reserved skip (AC-3, AC-4, AC-6)
  - files: oms-mcp-server/src/main/java/org/example/mcp/index/KnowledgeIndexService.java, oms-mcp-server/src/test/java/org/example/mcp/index/KnowledgeIndexServiceTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.index.KnowledgeIndexServiceTest'` passes
- [x] **T-6** Test-first `ConceptLinksTest`; implement `ConceptLinks` with invalidation from `rebuild()` (AC-5)
  - files: oms-mcp-server/src/main/java/org/example/mcp/docs/ConceptLinks.java, oms-mcp-server/src/test/java/org/example/mcp/docs/ConceptLinksTest.java, .../index/KnowledgeIndexService.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.docs.ConceptLinksTest'` passes
- [x] **T-7** Test-first `KnowledgeBaseToolsTest` (search hit metadata, whole read header/links/backlinks/broken, overview concepts only, reserved readable); implement tool changes and `KbExplorerController` parameters (AC-3, AC-5, AC-6)
  - files: oms-mcp-server/src/main/java/org/example/mcp/kb/KnowledgeBaseTools.java, .../kbexplorer/KbExplorerController.java, oms-mcp-server/src/test/java/org/example/mcp/kb/KnowledgeBaseToolsTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.kb.KnowledgeBaseToolsTest'` passes
- [x] **T-8** `RetrievalEvalTest` asserts MRR ≥ 0.80; run against the real bundle (AC-7)
  - files: oms-mcp-server/src/test/java/org/example/mcp/index/RetrievalEvalTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.index.RetrievalEvalTest'` passes with recall@5 ≥ 0.90 and MRR ≥ 0.80
- [x] **T-9** Full module check (AC-1 – AC-7)
  - files: (fixes only)
  - verify: `cd oms-mcp-server && ./gradlew check` passes
- [x] **T-10** Knowledge base and README: knowledge-services capability + new FR-045, FR-033, mcp-server component, log entry, oms-mcp-server README (AC-5)
  - files: oms-knowledge-base/capabilities/knowledge-services.md, oms-knowledge-base/functional-requirements/FR-033-serve-knowledge-base.md, oms-knowledge-base/functional-requirements/FR-045-okf-aware-knowledge-tools.md, oms-knowledge-base/functional-requirements/index.md, oms-knowledge-base/architecture/mcp-server.md, oms-knowledge-base/log.md, oms-mcp-server/README.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0 and `cd tools/okf-check && npm test` passes
- [x] **T-11** Run spec verify
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0011` exits 0
- [x] **T-12** Review fixes, test-first: overview title and project keys; `KbExplorerControllerTest` (JSON, sections, search filters); YAML scalars kept as text and date-only `stale_after`; metadata chunk isolated; link rules and backlinks; trust tier on legacy hits; stronger index assertions (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6)
  - files: oms-mcp-server/src/main/java/org/example/mcp/{docs/FrontMatter.java,docs/OkfMetadata.java,docs/ConceptLinks.java,index/SectionChunker.java,kb/KnowledgeBaseTools.java,kbexplorer/KbExplorerController.java}, oms-mcp-server/src/test/java/org/example/mcp/**
  - verify: `cd oms-mcp-server && ./gradlew check --rerun-tasks` passes and `node specs/tools/spec.mjs verify SPEC-0011` exits 0
- [x] **T-13** Re-review minor: only `true`/`false` are implicit booleans, like the checker's JSON schema (AC-1)
  - files: oms-mcp-server/src/main/java/org/example/mcp/docs/FrontMatter.java, oms-mcp-server/src/test/java/org/example/mcp/docs/OkfMetadataTest.java
  - verify: `cd oms-mcp-server && ./gradlew check --rerun-tasks` passes (118 tests)

## Notes

- T-12 added at verify (implement reopened): the spec-reviewer found AC-1 not met in the overview
  and gaps in test coverage; see verification.md → Independent Review.

- T-2 – T-7 are each one red→green cycle in the order of the data flow (parse → list → chunk →
  index → links → tools).
