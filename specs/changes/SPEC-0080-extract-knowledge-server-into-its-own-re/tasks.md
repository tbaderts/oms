# Tasks — SPEC-0080: Extract knowledge server into its own repository

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

All paths in the new repository are relative to the sibling clone `c:\data\workspace\knowledge-server`,
written `KS/` below. Server tests run with `cd KS/kb-server && ./gradlew test --tests …`.

### A. Bootstrap the `knowledge-server` repository

- [x] **T-1** Clone the remote into `KS/`, or `git init` with origin if the remote is empty. Add a root `.gitignore` and a stub `README.md` (AC-1)
  - files: KS/.gitignore, KS/README.md
  - verify: `git -C KS remote get-url origin` is `https://github.com/tbaderts/knowledge-server.git`; the `git ls-remote origin` result is recorded in Notes
- [x] **T-2** Copy an allow-list of source files: oms-mcp-server to `KS/kb-server`, and oms-kb-explorer to `KS/kb-explorer`. Exclude build/, bin/, logs/, .gradle/, .kb-index/, .env, node_modules/ and dist/ (AC-1)
  - files: KS/kb-server/**, KS/kb-explorer/**
  - verify: before any build, `find KS \( -name .env -o -name build -o -name node_modules -o -name .kb-index \)` finds nothing; the file counts under `src/` match the originals
- [x] **T-3** Write the failing neutrality test `io.kbserver.RepositoryNeutralityTest#noOmsReferencesInRepository` (AC-2)
  - files: KS/kb-server/src/test/java/io/kbserver/RepositoryNeutralityTest.java
  - verify: the test compiles and fails, listing the OMS references (red recorded in Notes)

### B. Strip OMS from the server

- [x] **T-4** Delete the `oms/*` package and its tests. Add `kb/McpToolsConfig`, which registers only the KB and health tools. Drop `oms.base-url` (AC-2, AC-6)
  - files: KS/kb-server/src/main/java/**/oms/*, src/test/java/**/oms/*, kb/McpToolsConfig.java, application*.yml
  - verify: `git -C KS grep -nE "searchOrders|OrderQueryClient" -- '*.java'` is empty; `./gradlew compileTestJava` passes
- [x] **T-5** Remove `includeBuild('../oms-contracts')` and the oms-contracts, jackson-databind-nullable and swagger-annotations dependencies. Rename the root project to `kb-server`, with group `io.kbserver` (AC-1, AC-2)
  - files: KS/kb-server/settings.gradle, KS/kb-server/build.gradle
  - verify: `cd KS/kb-server && ./gradlew compileJava` passes with no sibling `oms-contracts`
- [x] **T-6** Move package `org.example.mcp` to `io.kbserver`. Rename `SpringAiApplication` to `KbServerApplication` and `kbexplorer/KbExplorerController` to `api/KnowledgeApiController`. The app name and OTLP identity become `kb-server` / `knowledge-server`, and `run-mcp.*` becomes `run-server.*` (AC-2)
  - files: KS/kb-server/src/**, application.yml, run-server.ps1, run-server.sh
  - verify: `./gradlew compileTestJava` passes; `git -C KS grep -n "org.example"` is empty
- [x] **T-7** Neutralise the prompts, tool descriptions, health text, the server docs (`docs/*.md`) and the README (AC-2)
  - files: kb/KbMcpFeaturesConfig.java, kb/KnowledgeBaseTools.java, api/KnowledgeApiController.java, KS/kb-server/docs/**, KS/kb-server/README.md
  - verify: `git -C KS grep -inwE "oms|acme" -- kb-server` lists only test fixtures that still point at oms-knowledge-base (fixed in T-8 and T-10)

### C. Sample knowledge and eval

- [x] **T-8** Sample knowledge and its eval (AC-1, AC-2):
  - add `KS/examples/sample-knowledge/` with about 10 OKF docs, index.md and log.md;
  - rewrite `golden-queries.yaml` with about 12 queries on `sample/...` paths;
  - point `RetrievalEvalTest` at the sample, with the `kb.eval.repository` / `kb.eval.golden` overrides;
  - pin the baselines to the measured values, rounded down.
  - files: KS/examples/sample-knowledge/**, src/test/resources/retrieval-evals/golden-queries.yaml, index/RetrievalEvalTest.java, build.gradle (passes -P properties through to the test JVM)
  - verify: `./gradlew test --tests 'io.kbserver.index.RetrievalEvalTest'` passes; the measured recall@5 and MRR are recorded in Notes
- [x] **T-9** Save the 42 OMS golden queries to `oms/tools/retrieval-evals/oms-golden-queries.yaml` and run them through the knowledge server against the OMS knowledge base (AC-1)
  - files: tools/retrieval-evals/oms-golden-queries.yaml
  - verify: `./gradlew test --tests 'io.kbserver.index.RetrievalEvalTest' -Pkb.eval.repository=oms-knowledge-base=<abs path to oms-knowledge-base> -Pkb.eval.golden=<abs path to oms-golden-queries.yaml>` passes (recall@5 ≥ 0.90, MRR ≥ 0.80); run after T-11 with the final property names

### D. Multiple named repositories (server)

- [x] **T-10** Write the failing tests, and adapt `IndexTestSupport` to named repositories (AC-3, AC-4, AC-5):
  - `DocumentRepositoryTest#missingRepositoryIsUnavailableNotFatal`;
  - `KnowledgeBaseToolsTest#searchSpansRepositoriesAndLabelsHits`, `#overviewGroupsByRepository`, `#overviewMarksUnavailableRepository`, `#omsNamedRepositoryKeepsLegacyPaths`, `#repositoryFilterLimitsResults` and `#unknownRepositoryReturnsEmptyResult`.
  - files: src/test/java/io/kbserver/docs/DocumentRepositoryTest.java, kb/KnowledgeBaseToolsTest.java, index/IndexTestSupport.java
  - verify: the new tests compile and fail (red recorded in Notes)
- [x] **T-11** Repository configuration and `DocumentRepository` (AC-3, AC-5):
  - add `RepositoryProperties` (`knowledge.repositories`, validated, unique names) and `KnowledgeRepository`;
  - rework `DocumentRepository`: the name as path prefix, unavailable repositories with a WARN, `getRepositories`, `repositoryOf`, `hasRepository`, `DocMeta.repository` and `listAll(repository)`;
  - adapt `ConceptLinks`;
  - replace `domain.docs.paths` in every application*.yml.
  - files: docs/RepositoryProperties.java, docs/KnowledgeRepository.java, docs/DocumentRepository.java, docs/ConceptLinks.java, application*.yml, src/test/resources/application-test.yml
  - verify: `./gradlew test --tests 'io.kbserver.docs.*'` passes
- [x] **T-12** Add `repository` to `SectionChunk`, the Lucene document, `buildFilter`, a new `search(...)` overload and `SearchHit` (AC-3, AC-4)
  - files: index/SectionChunk.java, index/SectionChunker.java, index/KnowledgeIndexService.java
  - verify: `./gradlew test --tests 'io.kbserver.index.*'` passes
- [x] **T-13** Tool changes (AC-3, AC-4, AC-5):
  - a `repository` parameter on `searchKnowledgeBase`, and `[repo]` labels on hits;
  - an explained empty result for an unknown repository;
  - the overview grouped by repository, with an unavailable marker;
  - a `Repository:` line in `readKnowledgeBase`.
  - files: kb/KnowledgeBaseTools.java, kb/KbMcpFeaturesConfig.java
  - verify: `./gradlew test --tests 'io.kbserver.kb.KnowledgeBaseToolsTest'` passes
- [x] **T-14** Write the failing `KnowledgeApiControllerTest#searchFiltersByRepository`, `#unknownRepositoryIs400ProblemJson` and `#listRepositories` (AC-4, AC-5). Then implement:
  - `GET /api/kb/repositories`;
  - a `repository` parameter on `/documents` and `/search/*`, and `repository` on hits;
  - Problem+JSON 400 (`spring.webflux.problemdetails.enabled`).
  - files: api/KnowledgeApiController.java, src/test/java/io/kbserver/api/KnowledgeApiControllerTest.java, application.yml
  - verify: `./gradlew test --tests 'io.kbserver.api.KnowledgeApiControllerTest'` passes
- [x] **T-15** Add `KbServerApplicationTests#startsWithMissingRepository` and make the whole server suite green except the neutrality test, which waits for the UI (AC-1, AC-5)
  - files: src/test/java/io/kbserver/KbServerApplicationTests.java, remaining test fixtures
  - verify: `cd KS/kb-server && ./gradlew test` passes with `--tests` excluding only `RepositoryNeutralityTest`, and `RepositoryNeutralityTest` reports findings under `kb-explorer/` only

### E. UI

- [x] **T-16** Write the failing UI tests (AC-3, AC-4):
  - the repository filter (`okf/search.test.ts`);
  - the repository level of the tree, including an unavailable node and the single-repository collapse (`okf/sidebar.test.ts`);
  - `listRepositories` (`services/api.test.ts`).
  - files: KS/kb-explorer/src/okf/search.test.ts, src/okf/sidebar.test.ts, src/services/api.test.ts
  - verify: `cd KS/kb-explorer && npm ci && npm test` fails on the new cases only (recorded in Notes)
- [x] **T-17** Implement the repository support in the UI (AC-3, AC-4):
  - types and `listRepositories`;
  - the `repository` filter, the sidebar repository level, and repository badges in results and the header;
  - a relative `/api/kb` base with a Vite dev proxy;
  - sample data under `sample/`.
  - files: src/types/index.ts, src/services/api.ts, src/okf/search.ts, src/okf/sidebar.ts, src/components/{SearchBar,SearchResults,TreeView,DocumentHeader}.tsx, src/App.tsx, vite.config.ts
  - verify: `npm test` passes
- [x] **T-18** Rebrand: `KbLogo.tsx` replaces `AcmeLogo.tsx`; new header, footer and title text; package name `kb-explorer`; README; no OMS wording left in comments or fixtures (AC-2)
  - files: src/components/KbLogo.tsx, src/App.tsx, index.html, package.json, package-lock.json, README.md, src/**/*
  - verify: `npm run build` passes; `cd KS/kb-server && ./gradlew test --tests 'io.kbserver.RepositoryNeutralityTest'` passes

### F. Docker and docs (the knowledge server)

- [x] **T-19** Write a multi-stage `kb-server/Dockerfile`, a `kb-explorer/Dockerfile` with `nginx.conf` (proxying `/api/` and `/mcp`), and the root `docker-compose.yml` and `.env.example` (design §6) (AC-6)
  - files: KS/kb-server/Dockerfile, KS/kb-explorer/Dockerfile, KS/kb-explorer/nginx.conf, KS/docker-compose.yml, KS/.env.example
  - verify: `docker compose -f KS/docker-compose.yml config -q` passes; `docker compose -f KS/docker-compose.yml build` succeeds
- [x] **T-20** Write `KS/scripts/compose-smoke-test.ps1` and run it twice (AC-6):
  - the script brings the stack up with `--build`, sends MCP `initialize` and `tools/list`, reads a document through the UI and its proxy, checks that `searchOrders` is absent, then brings the stack down;
  - run it once with the sample knowledge base and once with `KB_REPO_NAME=oms-knowledge-base`, `KB_REPO_PATH=../oms/oms-knowledge-base`.
  - files: KS/scripts/compose-smoke-test.ps1
  - verify: the script exits 0 in both runs (output recorded in Notes)
- [x] **T-21** Write the root README: what the knowledge server is, how to configure repositories, MCP client setup, compose, the eval overrides, and a one-line migration note (AC-2)
  - files: KS/README.md
  - verify: `./gradlew test --tests 'io.kbserver.RepositoryNeutralityTest'` passes; the README has the sections Configuration, MCP clients, Docker Compose and Retrieval eval

### G. Push and fresh-clone check

- [x] **T-22** Run a secret scan and review the status. Commit `feat: kb-server and kb-explorer (initial import)` and push to `origin main`, without force (AC-1)
  - files: KS (git)
  - verify: the hits of `git -C KS grep -inE "password|secret|token|api[_-]?key"` are reviewed and are config keys or docs only; `git -C KS push origin main` succeeds; `git -C KS ls-remote origin main` equals the local HEAD
- [x] **T-23** Clone fresh into a temp dir with no siblings. Run `./gradlew check` in kb-server and `npm ci && npm run build` in kb-explorer (AC-1, AC-2)
  - files: none
  - verify: both commands exit 0 in the scratchpad clone

### H. OMS repository

- [x] **T-24** Run `spec set SPEC-0080 modules oms-knowledge-base`. Remove both modules from `specs/config.json` (from `modules` and from `oms-contracts.impacts`) (AC-7)
  - files: specs/config.json
  - verify: `node specs/tools/spec.mjs status SPEC-0080` shows modules `oms-knowledge-base`; `node -e "require('./specs/config.json')"` succeeds
- [x] **T-25** Delete `oms-mcp-server/` and `oms-kb-explorer/`. Update `settings.gradle`, `build.gradle`, `docker-compose.yml` (service and volume), `cockpit.yaml` and `.vscode/launch.json` (AC-7)
  - files: settings.gradle, build.gradle, docker-compose.yml, cockpit.yaml, .vscode/launch.json
  - verify: root `./gradlew build` passes; `docker compose config -q` passes; `test ! -e oms-mcp-server && test ! -e oms-kb-explorer`
- [x] **T-26** Register kb-server in `.mcp.json` and `.vscode/mcp.json`, and update the permissions in `.claude/settings.local.json` (AC-8)
  - files: .mcp.json, .vscode/mcp.json, .claude/settings.local.json
  - verify: a `node -e` check prints `knowledge http://localhost:8091/mcp` for both files
- [x] **T-27** Re-point the docs and agent guidance (AC-8):
  - `CLAUDE.md`, `README.md`, `AGENTS.md`, `ARCHITECTURE-REVIEW.md` and `.github/**`;
  - `.claude/skills/spec-verify/SKILL.md`, `specs/policies/architecture-policies.md` (P-04 wording) and `specs/templates/proposal.md`;
  - `oms-contracts/build.gradle` and its `README.md`, and `oms-core/scripts/lgtm-smoke-test.ps1`.
  - files: as listed
  - verify: `git grep -nE "oms-mcp-server|oms-kb-explorer" -- . ':!specs/archive' ':!specs/changes' ':!oms-knowledge-base'` is empty
- [x] **T-28** Update the knowledge-base pages listed in the design, set FR-034 to `status: deprecated`, and add a `log.md` entry (AC-8)
  - files: oms-knowledge-base/** (the pages in design → Knowledge Base Updates)
  - verify: `node tools/okf-check/okf-check.mjs oms-knowledge-base` exits 0; the AC-8 `git grep` with its exclusions is empty
- [x] **T-29** After a quiet window (parallel sessions), re-run the AC-7 checks: root `./gradlew build`, `docker compose config -q`, and `git grep` on the build, compose, spec and cockpit files (AC-7)
  - files: none
  - verify: all pass

### I. Verify

- [ ] **T-30** Run spec verify
  - verify: `node specs/tools/spec.mjs verify SPEC-0080` exits 0

## Notes

- Sections A to G finish, including a successful push in T-22, before any OMS-side deletion in H.
  That way OMS is never left without a working replacement.
- Red and green observations, measured eval numbers and the smoke-test output are recorded here
  during implementation.

### Implementation log (2026-11-28)

- **T-1** `git ls-remote` on the remote printed nothing (an empty repository). The clone warned
  "You appear to have cloned an empty repository" and is on branch `main`; origin is
  `https://github.com/tbaderts/knowledge-server.git`.
- **T-2** The copy uses `git ls-files` as the allow-list, so 129 tracked files and nothing
  untracked: no `.env`, build output or caches. The `src/` counts match (54 and 41). An early
  `git mv -k` silently did nothing, because the files were not yet in the new repo's index, and the
  following `rm` wiped the copied Java sources. They were restored from the OMS originals with no
  change on the OMS side.
- **Rename** (requester, mid-implementation): ContextCore became `kb-server` / `kb-explorer`. The
  proposal was reopened and re-approved, and the package became `io.kbserver`, the config
  `knowledge.repositories` and the eval properties `kb.eval.*`.
- **T-3 red:** `RepositoryNeutralityTest` listed findings in the server docs, the code and the
  whole UI. **Green after T-18.**
- **T-8** The sample eval scores 13 queries, recall@5 = 1.000, MRR = 0.885. Floors are rounded
  down to one decimal: 1.0 / 0.8.
- **T-9** The OMS golden set through kb-server scores 42 queries, recall@5 = 1.000, MRR = 0.808.
  That equals the pre-move figure in NFR-009; floors are 0.90 / 0.80.
- **T-10 red:** compile errors for the missing `RepositoryProperties`, `KnowledgeRepository` and
  `searchKnowledgeBase(…, repository)`. **Green after T-13:** `docs.*`, `index.*` and `kb.*`
  pass.
- **T-14 red:** 8 of 14 `KnowledgeApiControllerTest` cases failed (no `/repositories`, no
  `repository` parameter, no 400). Green afterwards.
- **T-15** The full server suite has 149 tests. They fail only in `RepositoryNeutralityTest`
  until T-18.
- **T-16 red:** 4 new UI tests failed (the repository filter, `listRepositories`, the relative
  base, the repository forest). Green after T-17; `npm run build` has 71 node tests and 20 vitest
  tests passing, and lint is clean.
- **Order deviation:** the rebrand (T-18) ran before T-16 and T-17, so that the UI baseline was
  green before the new tests were written.
- `tokens.test.ts` compared the UI tokens with the `oms-ui` sibling, which does not exist outside
  OMS. It was removed, because the UI no longer shares `oms-ui`'s tokens; the token prefix is now
  `--kb-`.
- Server docs: `ARCHITECTURE.md` is kept and rewritten. The OMS-era roadmap
  (`ARCHITECTURE_IMPROVEMENTS_SPEC.md`), the Copilot guide and the setup docs (`MCP.md`,
  `QUICK_*`, `docs/README.md`) were removed, and their setup content is now in the READMEs. See
  design, "Changed during implementation".
- **T-19** `docker compose config -q` passes, and `docker compose build` builds `kb-server:latest`
  and `kb-explorer:latest`. The server image builds its jar inside the image.
- **T-20** The smoke test (`scripts/compose-smoke-test.ps1`, ports 18091 / 18097, because the OMS
  stack's container holds 8091) exits 0 twice: once with `sample` and once with
  `oms-knowledge-base` (`../oms/oms-knowledge-base`). The checks are MCP `initialize`, a
  `tools/list` with the three knowledge tools and `ping` and no `searchOrders`, the app served, the
  repository available, and documents listed and read through the nginx proxy. The first run
  exposed a script bug (Windows PowerShell passes a JSON array as one pipeline object), which is
  fixed. It also exposed that `GET /documents/read` with an unknown path is a 500, not a 404; that
  is pre-existing and recorded as a follow-up.
- **T-22** The secret scan found only the `.gitignore` comment and a path-traversal test fixture
  (`../../etc/passwd`). The fixture reviewer handle was neutralised to `human:reviewer`. Commit
  `1b9bdb2`, `feat: kb-server and kb-explorer (initial import)`, was pushed to `origin main` (a new
  branch on an empty remote, no force), and `git ls-remote origin main` = `1b9bdb2d…` = local HEAD.
- **T-23** A fresh clone in the scratchpad with no siblings: `./gradlew check` passes (BUILD
  SUCCESSFUL), and `npm ci && npm run build` runs 71 node tests and 20 vitest tests, all passing,
  and builds.
- **T-24** The ticket's modules are now `oms-knowledge-base`. `specs/config.json` no longer has the
  `oms-mcp-server` or `oms-kb-explorer` modules, or `oms-mcp-server` among `oms-contracts.impacts`,
  and the JSON parses.
- **T-25** Both folders are deleted: tracked files with `git rm`, plus their untracked build output
  and a `.env` holding only local run settings, no secrets. The embedding cache was copied first to
  the new repo's gitignored `kb-server/.kb-index`. The `settings.gradle`, `build.gradle`,
  `docker-compose.yml` (service and volume), `cockpit.yaml` (check `kb-server`, HTTP
  `/api/kb/health`) and `.vscode/launch.json` changes are made. The root `./gradlew build` passes,
  `docker compose config -q` passes, and the folders are gone.
  - The OMS stack's running `oms-mcp-server` container was left alone, because this session's MCP
    tools use it. It is now an orphan of the OMS compose project; the maintainer removes it with
    `docker compose up -d --remove-orphans` once kb-server runs.
- **T-26** `.mcp.json` and `.vscode/mcp.json` register `knowledge` at `http://localhost:8091/mcp`.
  No `mcp__oms__` permission entries existed; one stale `oms-kb-explorer` README permission was
  removed from `.claude/settings.local.json`.
- **T-27** CLAUDE.md, README.md, `.github/**` (agent tools, chat mode order queries pointing at the
  Query API), the spec-verify skill, the P-04 consumer-list wording (not blocked by the hook; the
  wording changes, the rule does not), the proposal template, `oms-contracts` (stray-folder list,
  README) and `lgtm-smoke-test.ps1` are updated. AGENTS.md had no references.
- **T-28** The knowledge-base pages are updated as in the design. Code sources became GitHub URLs
  in knowledge-server, and every one resolves to a file in the clone. FR-034 is
  `status: deprecated`, `superseded_by: none`, `implementation: not-implemented`. `log.md` has an
  entry. `okf-check` exits 0 and `check-kb-refs` reports 0 findings.
  - `cd tools/okf-check && npm test` has 2 failures: undocumented `/admin/outbox/*` interface items
    and `ui/order-entry.md` not linked from a capability. Both fail identically on a clean HEAD
    worktree, so they are pre-existing and recorded as follow-ups.
- **T-29** After the OMS edits: the root `./gradlew build` passes, `docker compose config -q`
  passes, both folders are absent, `git grep` on the build, compose, spec and cockpit files is
  empty, and `spec check` gives PASS. `git status` shows only this ticket's changes, so no
  parallel-session edits.
- **AC-8 gap found during T-27/T-28.** Taken literally ("no matches outside specs/archive,
  SPEC-0080, KB archive, log.md"), AC-8 also requires edits to historical records: 62 other ticket
  folders under `specs/changes/` (61 of them done or at proposal), the dated root
  `ARCHITECTURE-REVIEW.md` (2026-08-15), and the `point_in_time` assessment
  `architecture-review-2026-10-30.md`. Rewriting them would falsify history, so the proposal is
  reopened to scope AC-8 to live documents.
