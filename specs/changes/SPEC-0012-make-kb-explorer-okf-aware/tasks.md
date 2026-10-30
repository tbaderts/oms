# Tasks — SPEC-0012: Make KB explorer OKF-aware

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

- [x] **T-1** Server, test-first: `OkfMetadata.sources`; `GET /api/kb/documents/links` with `ConceptLinks` injected into `KbExplorerController` (AC-5)
  - files: oms-mcp-server/src/main/java/org/example/mcp/docs/OkfMetadata.java, .../kbexplorer/KbExplorerController.java, oms-mcp-server/src/test/java/org/example/mcp/docs/OkfMetadataTest.java, .../kbexplorer/KbExplorerControllerTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.kbexplorer.*' --tests 'org.example.mcp.docs.OkfMetadataTest'` passes
- [x] **T-2** Explorer types: `OkfMetadata`, `DocMeta.concept`/`okf`, `Links` (AC-1, AC-3, AC-5)
  - files: oms-kb-explorer/src/types/index.ts
  - verify: `cd oms-kb-explorer && npx tsc -b` passes
- [x] **T-3** Test-first `status.ts` (AC-7)
  - files: oms-kb-explorer/src/okf/status.ts, oms-kb-explorer/src/okf/status.test.ts
  - verify: `cd oms-kb-explorer && node --test src/okf/status.test.ts` passes
- [x] **T-4** Test-first `links.ts` (AC-4)
  - files: oms-kb-explorer/src/okf/links.ts, oms-kb-explorer/src/okf/links.test.ts
  - verify: `cd oms-kb-explorer && node --test src/okf/links.test.ts` passes
- [x] **T-5** Test-first `sidebar.ts` (folder tree, type groups, filters) (AC-1, AC-2)
  - files: oms-kb-explorer/src/okf/sidebar.ts, oms-kb-explorer/src/okf/sidebar.test.ts
  - verify: `cd oms-kb-explorer && node --test src/okf/sidebar.test.ts` passes
- [x] **T-6** Test-first `header.ts` (AC-3)
  - files: oms-kb-explorer/src/okf/header.ts, oms-kb-explorer/src/okf/header.test.ts
  - verify: `cd oms-kb-explorer && node --test src/okf/header.test.ts` passes
- [x] **T-7** Test-first `search.ts` and `api.ts` filters + `getLinks` (mocked fetch); mock API with `okf` (AC-5, AC-6)
  - files: oms-kb-explorer/src/okf/search.ts, oms-kb-explorer/src/okf/search.test.ts, oms-kb-explorer/src/services/api.ts, oms-kb-explorer/src/services/api.test.ts
  - verify: `cd oms-kb-explorer && npm test` passes
- [x] **T-8** Components: `TreeView` (views, filters, badges), `DocumentHeader`, `LinksPanel`, `DocumentViewer` link renderer, `SearchResults` decoration, `SearchBar` filters, `App` wiring (AC-1 – AC-4, AC-6, AC-8)
  - files: oms-kb-explorer/src/components/*.tsx, oms-kb-explorer/src/App.tsx
  - verify: `cd oms-kb-explorer && npm run build` passes and `npx eslint` on the changed files reports no errors
- [x] **T-9** Browser check against a running MCP server: Types/Folders views, header, links panel, in-app link, search badges; screenshots saved under the ticket folder (AC-1 – AC-4, AC-6)
  - files: specs/changes/SPEC-0012-make-kb-explorer-okf-aware/screenshots/*
  - verify: screenshots show each feature with real knowledge base data
- [x] **T-10** Docs: explorer README, knowledge-services + FR-046, kb-explorer component, log (AC-8)
  - files: oms-kb-explorer/README.md, oms-knowledge-base/capabilities/knowledge-services.md, oms-knowledge-base/functional-requirements/FR-046-okf-aware-kb-explorer.md, oms-knowledge-base/architecture/kb-explorer.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0 and `cd tools/okf-check && npm test` passes
- [x] **T-11** Run spec verify (AC-8)
  - files: (none)
  - verify: `node specs/tools/spec.mjs verify SPEC-0012` exits 0
- [x] **T-12** Review fixes, test-first: Back/Forward (`popstate`); folder docs ordered by title; in-app links only for markdown and folders; only http/https/mailto sources clickable; `entryLabel`/`showTrustInTree`/`typesPresent` and the search title fallback moved into the models; header renders its model's title and trust; stronger browser evidence (filter, sources, folder index, Back) (AC-1, AC-2, AC-3, AC-4, AC-6, AC-8)
  - files: oms-kb-explorer/src/okf/{links,sidebar,search}.ts and tests, src/components/{TreeView,DocumentHeader,Badges,SearchBar,SearchResults}.tsx, src/App.tsx, specs/changes/SPEC-0012-make-kb-explorer-okf-aware/screenshots/*
  - verify: `cd oms-kb-explorer && npm test && npm run build && npx eslint src` pass; browser script shows Back returning to the previous document

## Notes

- T-9 needs oms-mcp-server running locally (`./gradlew bootRun`, BM25-only if Ollama is absent) and
  `npm run dev`; if the environment prevents it, the task records why and the verify stage notes the
  gap.
