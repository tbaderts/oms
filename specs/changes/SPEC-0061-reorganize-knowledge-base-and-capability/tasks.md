# Tasks — SPEC-0061: Reorganize knowledge base and capability catalogue

> **Stage 3 of 3 — the executable plan.** The implement stage works top to bottom and ticks each
> box only when its `verify:` check passes. Keep tasks small (one focused change, about one
> red→green cycle) and in dependency order.

## Tasks

### Block A — tooling first (rules, fixtures, code)

- [x] **T-1** Add failing fixture tests for the new checker rules: OMS-REVIEWED, OMS-RETIRED (prose fails, fenced code and `register: true` pass), OMS-ARCHIVE, OMS-ALIAS, OMS-UC, OMS-ACTOR, OMS-ADR, OMS-TRACE, OMS-CAP use-case link, and the requirement folders under `capabilities/`. Extend `test/fixtures/valid/` to the new layout: conventions with `reviewed_since`, `retired_terms` and the new types; one use case, one actor, one archive doc and one ADR (AC-3, AC-4, AC-5)
  - files: tools/okf-check/test/okf-check.test.mjs, tools/okf-check/test/fixtures/valid/**
  - verify: `cd tools/okf-check && node --test test/okf-check.test.mjs` fails only on the new rule tests (red)
- [x] **T-2** Implement the rules in okf-check.mjs (exported `FR_DIR`/`NFR_DIR`, settings read from conventions front matter) and make the fixture tests green (AC-3, AC-4, AC-5)
  - files: tools/okf-check/okf-check.mjs
  - verify: `cd tools/okf-check && node --test test/okf-check.test.mjs` passes except `the real bundle conforms` (expected red until Block D)
- [x] **T-3** Write `check-kb-refs.mjs` test-first against a fixture repo. Cases: a dangling ref fails, a `file:///oms-knowledge-base/...` ref resolves, excluded dirs and `log.md` are ignored, a bare legacy folder name fails (AC-10)
  - files: tools/okf-check/check-kb-refs.mjs, tools/okf-check/test/check-kb-refs.test.mjs, tools/okf-check/test/fixtures/refs/**
  - verify: `cd tools/okf-check && node --test test/check-kb-refs.test.mjs` passes
- [x] **T-4** Update kb-coverage tests to the new layout and add the root-layout test and the register-coverage test (base commit 33f4e20). Delete the SPEC-0009 metadata baseline test files (AC-1, AC-2, AC-5, AC-6)
  - files: tools/okf-check/test/kb-coverage.test.mjs, tools/okf-check/test/mcp-metadata.test.mjs (delete), tools/okf-check/test/mcp-metadata.mjs (delete), tools/okf-check/test/capture-baseline.mjs (delete), tools/okf-check/test/baseline-metadata.json (delete)
  - verify: `cd tools/okf-check && node --test test/kb-coverage.test.mjs` runs; the new tests fail against today's bundle (red, expected until Block D); no mcp-metadata files remain
- [x] **T-5** MCP: add failing tests `DocumentRepositoryTest#resolvesFormerIdThroughAliases`, `#unknownIdStillNotFound`, `#categoryFallsBackToTopLevelFolder` and `KnowledgeBaseToolsTest#readKnowledgeBaseReportsMove`, `#searchHidesDeprecatedByDefault`. Then implement `resolveAlias`/`readResolved`, the category fallback, the "Moved" line, deprecated filtering and the updated tool descriptions (AC-8)
  - files: oms-mcp-server/src/main/java/org/example/mcp/docs/DocumentRepository.java, oms-mcp-server/src/main/java/org/example/mcp/kb/KnowledgeBaseTools.java, oms-mcp-server/src/main/java/org/example/mcp/index/KnowledgeIndexService.java, oms-mcp-server/src/test/java/org/example/mcp/docs/DocumentRepositoryTest.java, oms-mcp-server/src/test/java/org/example/mcp/kb/KnowledgeBaseToolsTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.docs.DocumentRepositoryTest' --tests 'org.example.mcp.kb.KnowledgeBaseToolsTest'` passes
- [x] **T-6** Cockpit: add `kbLayout.ts`, then write failing `test/main/RequirementsService.test.ts` (fixture KB: capabilities, use cases, actors, FR implementation, actor kind, and a no-legacy-names grep over `src/`). Rewrite `RequirementsService`, update `shared/types/requirements.ts`, and switch `LinkIndexService`/`kbExtracts` to the layout (AC-7)
  - files: developer-cockpit/src/main/services/kbLayout.ts, developer-cockpit/src/main/services/RequirementsService.ts, developer-cockpit/src/shared/types/requirements.ts, developer-cockpit/src/main/storyboards/LinkIndexService.ts, developer-cockpit/src/main/storyboards/kbExtracts.ts, developer-cockpit/test/main/RequirementsService.test.ts, developer-cockpit/test/main/LinkIndexService.test.ts, developer-cockpit/test/main/storyboards.ipc.test.ts
  - verify: `cd developer-cockpit && npx vitest run test/main/RequirementsService.test.ts test/main/LinkIndexService.test.ts test/main/storyboards.ipc.test.ts` passes
- [x] **T-7** Cockpit: add the `requirements:getCapabilities` IPC, preload bridge and store loader, and a Capabilities tab (default) with an FR implementation badge, test-first with `test/renderer/RequirementsView.test.tsx`. Remove the dead `knowledgeBase.categories` config, and update the mock data in tests that use legacy paths (AC-7)
  - files: developer-cockpit/src/main/ipc/requirements.ipc.ts, developer-cockpit/src/preload/**, developer-cockpit/src/renderer/stores/requirements.ts, developer-cockpit/src/renderer/views/requirements/*.tsx, developer-cockpit/src/shared/types/config.ts, developer-cockpit/test/renderer/RequirementsView.test.tsx, developer-cockpit/test/main/McpToolRegistry.test.ts, developer-cockpit/test/main/AiService.test.ts, developer-cockpit/test/main/ai.ipc.test.ts
  - verify: `cd developer-cockpit && npm run typecheck && npx vitest run test/renderer/RequirementsView.test.tsx test/main/KbService.test.ts` passes

### Block B — move

- [x] **T-8** Confirm a quiet tree (`git status -- oms-knowledge-base oms-core/docs` clean apart from this ticket). Then write the one-off `migrate-links.mjs` with the design's move map and `git mv` every document to its target, adding `aliases: [<old id>]` and rewriting links across the bundle. Moved oms-core/docs files have their out-of-bundle links turned into `repo:` code spans (AC-1, AC-8)
  - files: tools/okf-check/scripts/migrate-links.mjs (temporary), oms-knowledge-base/**, oms-core/docs/**
  - verify: no `oms-concepts`, `oms-framework`, `oms-methodolgy`, `illustrations`, `interfaces`, `functional-requirements` or `non-functional-requirements` folder at the bundle root; `node tools/okf-check/okf-check.mjs oms-knowledge-base` reports no OKF-LINK errors
- [x] **T-9** Do the merges: simulator component and spec into one Component, kafka-topics and avro-messages into message-api, mission-control re-typed as Component. Rename the Decisions to ADR-nnn with `id`. Write all folder `index.md` files and the root index for the new tree, and delete `migrate-links.mjs` (AC-1)
  - files: oms-knowledge-base/**/index.md, oms-knowledge-base/architecture/**, oms-knowledge-base/domain/interfaces/**, oms-knowledge-base/tools/**
  - verify: okf-check reports no OKF-INDEX, OKF-LINK, OMS-ADR or OMS-ALIAS errors; `node --test test/kb-coverage.test.mjs` passes `every interface item is documented exactly once` and `bundle root has only the target layout`; scripts/migrate-links.mjs is gone

### Block C — review

- [x] **T-10** Review architecture/, framework/ and tools/ documents against the code, correcting, banner-marking, archiving or deleting each one. Remove legacy bold headers, set `updated`, and record each in the register. Includes archiving state-query-store and writing `framework/query-engine` from QueryController and the search code (AC-2, AC-3, AC-4)
  - files: oms-knowledge-base/architecture/**, oms-knowledge-base/framework/**, oms-knowledge-base/tools/**, oms-knowledge-base/archive/**, oms-knowledge-base/semantic-layer/kb-review-2026-11.md
  - verify: okf-check reports no OMS-REVIEWED, OMS-RETIRED or OMS-ARCHIVE errors under architecture/, framework/, tools/ and archive/
- [x] **T-11** Review domain/ (model, concepts, interfaces) and add the implementation-status banners to the unbuilt-behaviour specs; record in the register (AC-2, AC-3)
  - files: oms-knowledge-base/domain/**, oms-knowledge-base/semantic-layer/kb-review-2026-11.md
  - verify: okf-check reports no OMS-REVIEWED or OMS-RETIRED errors under domain/; `kb-coverage` `every entity and state symbol is documented` passes
- [x] **T-12** Review delivery/, ui/, semantic-layer/ (rewrite knowledge-base-strategy), archive the February review report and agent.md if confirmed redundant, and complete the register (AC-2, AC-3, AC-4)
  - files: oms-knowledge-base/delivery/**, oms-knowledge-base/ui/**, oms-knowledge-base/semantic-layer/**, oms-knowledge-base/archive/**
  - verify: `kb-coverage` `review register covers every pre-reorganisation document` passes

### Block D — gaps and capability model

- [x] **T-13** Write the gap documents from the design table (patterns, technical-debt register, market-adapter, delivery spec-driven-development, ci-cd and release-and-deploy, infrastructure x3, ui design-system, semantic-layer knowledge-graph and schema-and-constraints), each citing `repo:` sources where the thing exists (AC-1, AC-3)
  - files: oms-knowledge-base/architecture/patterns/**, oms-knowledge-base/architecture/technical-debt/**, oms-knowledge-base/architecture/context/market-adapter.md, oms-knowledge-base/delivery/**, oms-knowledge-base/infrastructure/**, oms-knowledge-base/ui/design-system.md, oms-knowledge-base/semantic-layer/**
  - verify: okf-check has no errors for these files; every folder index links them
- [x] **T-14** Re-check every capability's maturity and commands and every FR/NFR's implementation and sources against the current code and tests, correcting where SPEC-0018 to SPEC-0060 changed things (AC-6)
  - files: oms-knowledge-base/capabilities/*.md, oms-knowledge-base/capabilities/functional-requirements/*.md, oms-knowledge-base/capabilities/non-functional-requirements/*.md
  - verify: okf-check reports no OMS-SRC or OMS-REQ errors; `kb-coverage` `every command schema belongs to exactly one capability` passes
- [x] **T-15** Write the actors and the use cases (≥1 per capability, every FR/NFR linked from one), link the use cases from their capabilities, and add FR-047 and FR-048 for this ticket's new behaviour (AC-5, AC-7)
  - files: oms-knowledge-base/capabilities/actors/**, oms-knowledge-base/capabilities/use-cases/**, oms-knowledge-base/capabilities/*.md, oms-knowledge-base/capabilities/functional-requirements/FR-047-*.md, oms-knowledge-base/capabilities/functional-requirements/FR-048-*.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0 and `cd tools/okf-check && npm test` passes
- [x] **T-16** Add a real-KB test to RequirementsService.test.ts (counts equal the FR/NFR files, ≥1 UC/actor/capability) and a KbService test for categories equal to the top-level folders (AC-7)
  - files: developer-cockpit/test/main/RequirementsService.test.ts, developer-cockpit/test/main/KbService.test.ts
  - verify: `cd developer-cockpit && npm run typecheck && npm test` passes
- [x] **T-17** Rewrite `golden-queries.yaml` to the new paths, add ≥1 query per top-level folder, and add `RetrievalEvalTest#goldenSetCoversEveryTopLevelFolder` and `#expectedPathsExist` (AC-9)
  - files: oms-mcp-server/src/test/resources/retrieval-evals/golden-queries.yaml, oms-mcp-server/src/test/java/org/example/mcp/index/RetrievalEvalTest.java
  - verify: `cd oms-mcp-server && ./gradlew test --tests 'org.example.mcp.index.RetrievalEvalTest'` passes with recall@5 ≥ 0.90

### Block E — references and docs

- [x] **T-18** Update references outside the bundle: CLAUDE.md, .github/copilot-instructions.md, .github/chatmodes/Oms.chatmode.md, the spec-propose and spec-design skills, mission-control/README.md, the oms-core Javadoc `@see` links (sla-measurement goes to capabilities/order-sla-monitoring), the developer-cockpit spec docs, and the kb-explorer fixtures (AC-10)
  - files: CLAUDE.md, .github/copilot-instructions.md, .github/chatmodes/Oms.chatmode.md, .claude/skills/spec-propose/SKILL.md, .claude/skills/spec-design/SKILL.md, mission-control/README.md, oms-core/src/main/java/**, developer-cockpit/spec/*.md, oms-kb-explorer/src/okf/fixtures.ts
  - verify: `node tools/okf-check/check-kb-refs.mjs` exits 0; `cd oms-kb-explorer && npm run build` passes; `cd oms-core && ./gradlew compileJava` passes
- [x] **T-19** Update okf-conventions.md, tools/okf-check/README.md, tools/knowledge-server.md, tools/developer-cockpit.md and knowledge-services.md, and add the log.md entry for 2026-11-14 (P-19)
  - files: oms-knowledge-base/okf-conventions.md, tools/okf-check/README.md, oms-knowledge-base/tools/knowledge-server.md, oms-knowledge-base/tools/developer-cockpit.md, oms-knowledge-base/capabilities/knowledge-services.md, oms-knowledge-base/log.md
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0 and `node tools/okf-check/check-kb-refs.mjs` exits 0
- [x] **T-22** Remove the unused Qdrant container and its volume from the root compose file, and update every page that mentions it: debt item TD-2 is resolved (AC-10)
  - files: docker-compose.yml, oms-knowledge-base/infrastructure/local-docker-stack.md, oms-knowledge-base/architecture/context/system-context.md, oms-knowledge-base/tools/knowledge-server.md, oms-knowledge-base/architecture/technical-debt/technical-debt-register.md, .github/copilot-instructions.md
  - verify: `docker compose config --services` lists no qdrant; `grep -ri qdrant docker-compose.yml` finds nothing; okf-check exits 0
- [x] **T-23** Cockpit Knowledge Base view: a real nested folder tree (a category per folder at every depth, documents only in their own folder), index.md and log.md not listed as documents, deprecated documents marked. Test-first in `test/main/KbService.test.ts` and `test/renderer/CategoryTree.test.tsx` (AC-7)
  - files: developer-cockpit/src/main/services/KbService.ts, developer-cockpit/src/shared/types/*.ts, developer-cockpit/src/renderer/views/knowledge-base/CategoryTree.tsx, developer-cockpit/test/main/KbService.test.ts, developer-cockpit/test/renderer/CategoryTree.test.tsx
  - verify: `cd developer-cockpit && npm run typecheck && npx vitest run test/main/KbService.test.ts test/renderer/CategoryTree.test.tsx` passes
- [x] **T-24** Cockpit Requirements view: the Use Cases tab shows capability, alternative flows and linked requirements; the Non-Functional tab shows implementation. Test-first in `test/renderer/RequirementsView.test.tsx` (AC-7)
  - files: developer-cockpit/src/renderer/views/requirements/UseCasesTab.tsx, developer-cockpit/src/renderer/views/requirements/NonFunctionalReqTab.tsx, developer-cockpit/test/renderer/RequirementsView.test.tsx
  - verify: `cd developer-cockpit && npm run typecheck && npx vitest run test/renderer/RequirementsView.test.tsx` passes
- [x] **T-20** Run every module check (AC-1 to AC-10)
  - files: none
  - verify: `cd tools/okf-check && npm test`; `cd oms-mcp-server && ./gradlew check`; `cd developer-cockpit && npm run typecheck && npm test && npm run check:storyboards`; `cd oms-kb-explorer && npm run build`; all pass
- [x] **T-25** Fix the four pre-existing developer-cockpit test failures (maintainer decision, 2026-11-14): the stale command API version assertion, the two tests whose "foreign-platform" path resolves on Windows, and the storyboard evidence card pinned before the cited code changed (review the cited lines, then re-pin) (AC-7, AC-10)
  - files: developer-cockpit/test/main/ApiCatalogService.test.ts, developer-cockpit/test/main/workspaceRoot.test.ts, developer-cockpit/test/main/StoryboardService.scan.test.ts, oms-knowledge-base/storyboards/order-lifecycle/place-and-fill-order/story.card.yaml
  - verify: `cd developer-cockpit && npm test` passes with no failures; `npm run check:storyboards -- --strict` passes
- [x] **T-26** Resolve the spec-reviewer findings (2026-11-14): restore the event schema-version rule in state-store.md; bring target-architecture §10, ci-cd.md, knowledge-server.md, the debt register and order-lifecycle status up to date; fix the agent profile table, oms-core/README.md, root README/ARCHITECTURE-REVIEW Qdrant mentions and remaining prose references; extend check-kb-refs to retired file names and oms-core/docs paths; add a duplicate-UC fixture test; read CommandDispatcher in the dispatch extractor; dedupe the golden set; state in the register what "keep" means (AC-2, AC-5, AC-6, AC-9, AC-10)
  - files: oms-knowledge-base/**, tools/okf-check/check-kb-refs.mjs, tools/okf-check/test/*.mjs, .github/agents/oms.agent.md, oms-core/README.md, README.md, ARCHITECTURE-REVIEW.md, oms-mcp-server/src/test/resources/retrieval-evals/golden-queries.yaml
  - verify: okf-check exits 0, `cd tools/okf-check && npm test` passes, `node tools/okf-check/check-kb-refs.mjs` exits 0, `RetrievalEvalTest` passes
- [x] **T-21** Run spec verify
  - files: none
  - verify: `node specs/tools/spec.mjs verify SPEC-0061` exits 0

## Notes

- Between T-2 and T-15 the real-bundle tests in tools/okf-check are expected to be red. Each task's
  verify names the rules or tests that must pass at that point.
- T-8 to T-12 run in one sitting with no peer session editing `oms-knowledge-base/` (see memory
  "parallel sessions"). Verify (T-20/T-21) needs a quiet window too.
- Commits only when the maintainer asks (`git.commitPerTask: false`).
- T-16: the new tests pass (`RequirementsService.test.ts`, `KbService.test.ts`, typecheck). `npm test`
  still has four failures that are **pre-existing and unrelated**, proven by running them on a clean
  worktree of the base commit 33f4e20, where they fail the same way: `expandRoots` foreign-platform
  root (Windows), `ApiCatalogService` expects command API 3.2.0 (contract is 3.4.0 since ad1ddd3),
  `StoryboardService` missing-workspace scan (Windows), and the strict storyboard corpus check
  (evidence card pinned at 09bd78e, cited code changed in e918878, 6bd232a, ad1ddd3). The one
  failure this ticket caused (storyboard `kb_links` to `/domain/order-state.md`) is fixed.
- Added during implementation: `KbService` put each root file (index.md, log.md, …) in a category
  of its own; fixed to `root` (found by the T-16 categories test, AC-7).
- T-18, T-19 and T-20 are done except for one thing an agent may not do: `check-kb-refs` still reports
  two lines of `specs/policies/architecture-policies.md` (lines 103 and 124 name the
  `oms-framework/` files). Policies are human-edited only. Everything else in their verify passes
  (2026-11-14): okf-check 0 errors on 204 concepts, okf-check tests 37/37, `oms-mcp-server ./gradlew
  check`, cockpit typecheck, `check:storyboards`, KB explorer tests 31/31 and build, oms-core
  compile. The cockpit's `npm test` has only the four pre-existing failures listed under T-16.
- During T-18 the reference remap touched an applied Liquibase changelog comment
  (`014-order-events-schema-version.yaml`); it was reverted at once (P-07) and the changelog
  folder is excluded from `check-kb-refs`.
- T-22 to T-24 added after the maintainer's review (2026-11-14): Qdrant is confirmed unused since
  the switch to Lucene (commit 8fa55b3), and the cockpit's Knowledge Base tree only handled one
  folder level, which the new layout exposes (sub-folders opened empty, all documents of a section
  listed flat). The Requirements view did not show fields the service already returns.
