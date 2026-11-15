# Design — SPEC-0061: Reorganize knowledge base and capability catalogue

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

**The bundle today.** `oms-knowledge-base/` holds 90 concepts plus indexes and is an OKF v0.2
bundle (SPEC-0009). The structured layer from SPEC-0010 (`capabilities/`,
`functional-requirements/`, `non-functional-requirements/`, `domain/`, `interfaces/`,
`architecture/`) sits next to the original folders (`oms-concepts/`, `oms-framework/`,
`oms-methodolgy/`, `illustrations/`, `ui/`) and five loose root files. Two folders are not
concepts: `storyboards/` (owned by the cockpit, skipped by the checker) and `animations/` (Manim
scenes, no `.md`).

**`tools/okf-check/okf-check.mjs`** is the checker.
- It reads `type_vocabulary` from `<bundle>/okf-conventions.md`.
- `checkStructure()` enforces `OMS-CAP`, `OMS-REQ` (the requirement folder name is hard-coded:
  `functional-requirements` / `non-functional-requirements` at the bundle root), `OMS-SRC` and
  `OMS-PROV`.
- `checkIndexes()` and `OKF-LINK` keep the bundle navigable.

Its tests:
- `test/okf-check.test.mjs`: rules against `test/fixtures/valid/`.
- `test/kb-coverage.test.mjs`: the bundle against the code. Commands to capabilities, interface
  items, entities and states (hard-coded `domain/order-state.md`), reachability, and the cockpit
  scan port (hard-coded folders).
- `test/mcp-metadata*.mjs` + `baseline-metadata.json`: SPEC-0009's proof that the conversion kept
  the legacy header metadata, keyed by today's paths.

**oms-mcp-server.**
- `docs/DocumentRepository#readContent` resolves a path against `domain.docs.paths` and throws
  `IllegalArgumentException` on a miss. `KnowledgeBaseTools#readKnowledgeBase` turns that into
  `Error: …`.
- `DocMeta.category` is the legacy `**Category:**` header, null for almost every document. It
  feeds the search `category` filter.
- `index/RetrievalEvalTest` scores `src/test/resources/retrieval-evals/golden-queries.yaml`
  (30 queries, expected paths such as `oms-knowledge-base/oms-concepts/order-lifecycle.md`) at
  recall@5 ≥ 0.90.

**developer-cockpit.**
- `src/main/services/RequirementsService.ts` scans `<kb>/use-cases`, `functional-requirements`,
  `non-functional-requirements` and `actors`, each also under `oms-concepts/` and
  `oms-framework/`.
  - It maps FR `status` (always the OKF `draft`) into a type that expects
    `draft|approved|implemented|tested`.
  - It maps actor type from `frontmatter.type`, which in OKF is the concept type.
- `ipc/requirements.ipc.ts` exposes four getters, and `renderer/stores/requirements.ts` and
  `views/requirements/*Tab.tsx` render them.
- There is no capability getter.
- `storyboards/LinkIndexService.ts` and `storyboards/kbExtracts.ts` hard-code the two requirement
  folders and `domain/order-state.md`.
- `shared/types/config.ts` has a default `knowledgeBase.categories: ['oms-concepts', 'oms-framework',
  'oms-methodolgy']`. Nothing reads it: `KbService` already derives categories from each
  document's first path segment.

**oms-kb-explorer.** Only `src/okf/fixtures.ts` names KB paths; the views are path-agnostic.

**References outside the bundle** to KB paths:
- CLAUDE.md (structure tree and documentation references);
- `.github/copilot-instructions.md` and `.github/chatmodes/Oms.chatmode.md`;
- `.claude/skills/spec-propose` and `spec-design`;
- `mission-control/README.md`;
- about 15 Javadoc `@see file:///oms-knowledge-base/...` links in oms-core, one to a page that
  never existed (`oms-concepts/sla-measurement.md`);
- `oms-core/docs/*.md`.

Closest existing example: SPEC-0010 (`specs/archive/SPEC-0010-…`), which added the structured layer
together with checker rules, coverage tests and a cockpit scan port. This design extends the same
checker, the same coverage-test style and the same front-matter key conventions rather than adding
new tooling.

Read for this design:
- `okf-conventions.md`, `oms-knowledge-base-strategy.md`, `capabilities/index.md` and its
  capabilities;
- the folder indexes;
- `tools/okf-check/README.md`;
- `architecture-policies.md`.

## Approach

The work happens in five blocks, each independently verifiable.

### Block A — Tooling first (checker, conventions, cockpit and MCP code)

The rules land before the content, so the migration is driven by a failing check (P-14).

**`okf-conventions.md`** (stays at the bundle root) gains the following.

1. New types in `type_vocabulary`, each with a definition row:
   - `Use Case` (folder `capabilities/use-cases/`)
   - `Actor` (folder `capabilities/actors/`)
   - `Pattern`, an implementation pattern (folder `architecture/patterns/`)
2. Project keys:
   - `Use Case`:
     - `id: UC-nnn`, unique;
     - `actors`: non-empty list of bundle paths to `Actor` concepts;
     - `capability`: bundle path to a `Capability`.
     - The body links its requirements under `## Requirements` and has `## Preconditions`,
       `## Main Flow`, `## Alternative Flows` and `## Postconditions` sections (list items).
   - `Actor`: `kind`, one of `human`, `system` or `external`.
   - `Decision`: `id: ADR-nnn`, unique, and the file name starts with it.
   - Any concept may carry:
     - `aliases`: list of former concept ids, bundle-relative without `.md`;
     - `superseded_by`: bundle path or the literal `none`.
3. Bundle-level settings in its front matter:
   - `reviewed_since: "2026-11-14T00:00:00Z"`.
   - `retired_terms: [ReadySet, logical replication, Spring Boot 3, oms-methodolgy, oms-concepts/,
     oms-framework/]`. The register's old-path column is exempt (see rule `OMS-RETIRED`).
   - `archive_dir: archive`.

**`okf-check.mjs`** changes:

| Rule | Change |
|---|---|
| `OMS-REQ` | Requirement folder becomes `capabilities/functional-requirements` / `capabilities/non-functional-requirements` (constants `FR_DIR`, `NFR_DIR`, exported). |
| `OMS-CAP` | Additionally: links at least one `Use Case`. |
| `OMS-UC` (new) | `Use Case`: `id` matches `UC-\d{3}`, unique, file name starts with it, lives in `capabilities/use-cases/`. `actors` non-empty and each resolves to an `Actor`. `capability` resolves to a `Capability`. The body links at least one `Requirement`. |
| `OMS-ACTOR` (new) | `Actor`: `kind` ∈ {human, system, external}, lives in `capabilities/actors/`. |
| `OMS-ADR` (new) | `Decision`: `id` matches `ADR-\d{3}`, unique, file name starts with it. |
| `OMS-TRACE` (new) | Every `Requirement` is linked from at least one `Use Case` body. |
| `OMS-REVIEWED` (new) | A concept outside `archive/` needs `updated` ≥ `reviewed_since`. Skipped when the conventions do not set `reviewed_since`, so the fixtures stay small. |
| `OMS-RETIRED` (new) | Prose outside `archive/` (body text outside fenced code and inline code spans) must not contain a `retired_terms` entry, case-insensitive. Files whose front matter sets `point_in_time: true` are exempt: dated records (assessments, the review register) that describe the system as it was. |
| `OMS-ARCHIVE` (new) | A concept under `archive/` has `status: deprecated`. Any `deprecated` concept has `superseded_by` that resolves to a concept or is `none`. |
| `OMS-ALIAS` (new) | `aliases` entries are strings, unique across the bundle, and do not name an existing concept. |
| `OMS-PROV` | Unchanged set of types. `Use Case`, `Actor` and `Pattern` are not added (actors and planned use cases have no code to cite). |

`isMainSource` / `isTestSource` and `OMS-SRC` are unchanged.

**developer-cockpit**
- New `src/main/services/kbLayout.ts` exports `CAPABILITIES_DIR`, `USE_CASES_DIR`, `ACTORS_DIR`,
  `FR_DIR`, `NFR_DIR` and `ORDER_STATE_DOC = 'domain/model/order-state.md'`.
  `RequirementsService`, `LinkIndexService` and `kbExtracts` import from it.
- `RequirementsService` scans only the layout folders: the `oms-concepts`/`oms-framework` fallbacks
  and `scanAllForType` are removed.
  - New `getCapabilities()` returns `Capability { id (file slug), title, description, maturity,
    commands, useCases: string[] (UC ids linked in body), requirements: string[] (FR/NFR ids
    linked in body), source }`.
  - `getUseCases()` reads the new keys and sections.
  - `getActors()` maps `kind` (not `type`).
  - `getFunctionalRequirements()` exposes `implementation` and `capability`. `status` becomes the
    OKF status.
- `shared/types/requirements.ts`:
  - add `Capability`;
  - `FunctionalRequirement.status: 'draft' | 'stable' | 'deprecated'`, plus `implementation` and
    `capability`;
  - `Actor.kind`, replacing `Actor.type`;
  - `UseCase.capability` and `UseCase.requirements`.
- IPC channel `requirements:getCapabilities`, the preload bridge, `loadCapabilities` in the store,
  and a new `views/requirements/CapabilitiesTab.tsx`. It is a table: title, maturity badge, use
  case count, requirement count; selecting a row lists its use cases and requirements.
  - The view becomes Capabilities | Use Cases | Functional | Non-Functional | Actors, defaulting to
    Capabilities.
  - `FunctionalReqTab` shows an implementation badge in place of status.
- Remove the unused `knowledgeBase.categories` from `shared/types/config.ts` (type and default).
  `KbService` keeps deriving categories from top-level folders.

**oms-mcp-server**
- `DocumentRepository`:
  - New `Optional<Resolved> resolveAlias(String requested)`. It normalises the input (strips a
    leading `oms-knowledge-base/` and a trailing `.md`), scans the `aliases` front matter of all
    doc files and returns the matching path. The bundle has about 120 files, so it scans on every
    miss and keeps no cache that could go stale.
  - `readContent` falls back to it on a miss.
  - New `ResolvedDoc readResolved(String)` returns `{ path, content, movedFrom }`.
  - `DocMeta.category` = legacy header category, else the first path segment under the base dir
    (`architecture`, `capabilities`, …). This makes the existing `category` filter useful.
- `KnowledgeBaseTools`:
  - `readKnowledgeBase` uses `readResolved`. On an alias hit, the output starts with
    ``> Moved: `<old>` is now `<new>`.`` followed by the normal output for `<new>`.
  - An unknown path keeps today's `Error: … not found` text.
  - `searchKnowledgeBase` excludes `status=deprecated` hits unless the caller passes
    `status=deprecated`.
  - The tool descriptions use a new example path, and `category` is described as a top-level
    section.
- `golden-queries.yaml`: every expected path rewritten from the register, plus at least one query
  per top-level folder (architecture, framework, domain, capabilities, tools, delivery,
  infrastructure, ui, semantic-layer).

### Block B — Move (mechanical, `git mv` so history follows)

Every existing concept moves according to the map below.
- Moved concepts get `aliases: [<old id>]`.
- Relative links are rewritten by a one-off script, `tools/okf-check/scripts/migrate-links.mjs`.
  It loads the map, rewrites every markdown link in the bundle whose target was moved, and is
  deleted at the end of Block B. The plan keeps it out of the final diff.
- Folder `index.md` files are regenerated by hand to the new tree.
- `log.md` keeps its history, but its links are rewritten (`OKF-LINK` applies to it).

### Block C — Review (content)

Every document from the pre-move list gets one disposition in the register
`semantic-layer/kb-review-2026-11.md`. The register is type `Assessment`, has `point_in_time: true`, and
its table is `| Old path | Disposition | New path | Notes |`. Review procedure per document:
1. Check every class, file, endpoint, topic, table and technology it names against the repo
   (grep). Check every behaviour stated as current against the code and capability maturity.
2. Correct, or reword into "planned / not built (see capability X)".
3. Remove the legacy bold `**Version/Status/Last Updated**` header lines. Front matter is the only
   metadata.
4. Set `updated: "2026-11-14T…Z"`.
5. Record the findings in the register's Notes, and flag documents that need a human decision
   (`needs-human`).

Long specification papers that describe unbuilt behaviour (replace, grouping, allocation, booking)
are not rewritten. Each gets a short `> **Implementation status:**` banner under the H1 that links
the capability and states its maturity, and its front matter `status` drops to `draft` when the
banner applies.

### Block D — Fill gaps and capability model

New concepts (written from the code where the thing exists, with `repo:` sources):

| Path | Type | Basis |
|---|---|---|
| `architecture/context/market-adapter.md` | Concept Paper | planned; target-architecture §system overview |
| `architecture/patterns/kafka-messaging.md` | Pattern | `CommandListener`, `OutboxRelay`, streaming `KafkaConfig` |
| `architecture/patterns/transaction-handling.md` | Pattern | command processors, `OrderEventAppender`, outbox write in one tx |
| `architecture/patterns/logging-and-tracing.md` | Pattern | OTLP config, trace-id propagation through outbox headers / MDC |
| `architecture/patterns/service-template.md` | Pattern | shape shared by oms-core / streaming / simulator (build, config, telemetry, compose entry) |
| `architecture/technical-debt/technical-debt-register.md` | Assessment | open findings of the moved reviews and capability *Known gaps* |
| `tools/mission-control.md` | Component | merged from `oms-concepts/mission-control.md` |
| `delivery/spec-driven-development.md` | Methodology | `specs/README.md`, gates, cockpit spec views |
| `delivery/ci-cd.md` | Methodology | `.github/workflows/spec-gates.yml`, `openwiki-update.yml`; states what does not exist |
| `delivery/release-and-deploy.md` | Methodology | root `docker-compose.yml` build; states no release pipeline exists |
| `infrastructure/local-docker-stack.md` | Architecture | root `docker-compose.yml` |
| `infrastructure/cozystack.md` | Concept Paper | planned: Kubernetes, Postgres/Kafka/Redis/Qdrant operators |
| `infrastructure/observability.md` | Architecture | Alloy / Loki / Tempo / Mimir / Grafana config, sections Logs / Traces / Metrics |
| `ui/design-system.md` | Specification | oms-ui tokens and components (SPEC-0058/0060) |
| `semantic-layer/knowledge-graph.md` | Concept Paper | today's graph (links, `capability`, `sources`, cited-by) and the intended direction |
| `semantic-layer/schema-and-constraints.md` | Reference | every checker rule and what it protects; links `okf-conventions.md` |
| `semantic-layer/kb-review-2026-11.md` | Assessment | the register |
| `capabilities/actors/*.md` | Actor | trader, client-system, venue, operations-user, downstream-system, scheduler, developer, ai-agent |
| `capabilities/use-cases/UC-nnn-*.md` | Use Case | one or more per capability; every FR/NFR linked from one |

Capability `maturity`, FR/NFR `implementation` and their `sources` are re-checked against the code
after SPEC-0018 to SPEC-0060: dispatch lists, the processors, and the tests that exist.

### Block E — References and cleanup

- Update every reference outside the bundle:
  - CLAUDE.md (structure tree and documentation references);
  - `.github/copilot-instructions.md`, `.github/chatmodes/Oms.chatmode.md`;
  - `.claude/skills/spec-propose/SKILL.md`, `spec-design/SKILL.md`;
  - `mission-control/README.md`;
  - Javadoc `@see` links in oms-core (comment-only edits); the dangling `sla-measurement.md` link
    points to `capabilities/order-sla-monitoring.md`;
  - `developer-cockpit/spec/*.md` where they name KB folders.
- New `tools/okf-check/check-kb-refs.mjs` (with a `test/check-kb-refs.test.mjs`).
  - It runs over `git ls-files` (text files), excluding `specs/archive/`, `specs/changes/`
    (except this ticket's own folder, which is excluded as well), `openwiki/`,
    `oms-knowledge-base/archive/`, `oms-knowledge-base/semantic-layer/kb-review-2026-11.md` and
    `oms-knowledge-base/log.md` (history may name old folders in prose; its links are still checked
    by `OKF-LINK`). Test mocks that use legacy paths as sample data (for example
    `developer-cockpit/test/main/McpToolRegistry.test.ts`, `AiService.test.ts`) are updated to new
    paths rather than excluded.
  - It extracts every `oms-knowledge-base/<path>` reference (`file:///` prefixed or not, link or
    plain text) and fails when the path does not exist. It also fails on any bare `oms-concepts/`,
    `oms-framework/` or `oms-methodolgy/` mention.
  - Exit 0 clean, 1 findings.
- Delete `test/mcp-metadata.test.mjs`, `test/mcp-metadata.mjs`, `test/capture-baseline.mjs` and
  `test/baseline-metadata.json` (see Decisions).
- Update `oms-kb-explorer/src/okf/fixtures.ts` paths.
- Add a `log.md` entry for 2026-11-14.

### Target tree and move map

The register is the authority; this is the plan it starts from. Paths are relative to
`oms-knowledge-base/`. *(n)* = new document.

```
index.md  log.md  okf-conventions.md
architecture/
  index.md
  context/        system-context ← architecture/system-context
                  oms-core, oms-contracts, streaming-service, oms-ui ← architecture/<same>
                  exchange-simulator ← merge(architecture/exchange-simulator, oms-concepts/exchange-simulator)
                  market-adapter (n)
  concepts/       event-streaming ← oms-concepts/streaming-architecture
                  projections ← oms-concepts/projections
                  state-store ← oms-framework/oms-state-store   (event log + snapshot; reviewed against OrderEventAppender)
                  target-architecture ← oms-core/docs/target-architecture.md (+ SVGs/PDF to illustrations/target-architecture/)
  decisions/      ADR-001-contracts-module ← architecture/contracts-module
                  ADR-002-event-sourcing ← architecture/event-sourcing
                  ADR-003-shared-table-cqrs ← architecture/shared-table-cqrs
                  ADR-004-task-pipeline-and-state-machine ← architecture/task-pipeline-and-state-machine
                  ADR-005-transactional-outbox ← architecture/transactional-outbox
  patterns/       contract-first-codegen ← oms-framework/openapi-contracts
                  kafka-messaging, transaction-handling, logging-and-tracing, service-template (n)
  technical-debt/ technical-debt-register (n)
  assessments/    architecture-review-2026-10-30, event-sourcing-cqrs-review-2026-11-07, load-baseline-2026-11-08 ← oms-core/docs/<same>
                  architecture-convergence-assessment ← oms-methodolgy/architecture-convergence-assessment (+ .pdf)
                  architecture-specification ← oms-core/docs/architecture-specification.md (review decides update or archive)
  illustrations/  order-allocation-diagrams ← illustrations/order_allocation_diagrams
                  task-orchestration-diagrams ← illustrations/task-orchestration-diagrams
framework/        state-machine ← oms-framework/state-machine-framework_spec
                  validation-engine ← oms-framework/validation-rules
                  task-orchestrator ← oms-framework/task-orchestration-framework_spec
                  query-engine (n, from QueryController/search specification code; replaces the archived state-query-store_spec)
                  exception-handling ← oms-framework/error-handling
domain/
  model/          order, execution, order-event, outbox-message, command-log, order-state, order-quantities,
                  quote-and-quote-request, glossary ← domain/<same>
                  domain-model ← oms-framework/domain-model_spec  (field reference; overlap with order.md resolved in review)
  concepts/       order-lifecycle, execution-reporting, order-quantity-calculations, order-replace, order-grouping,
                  block-order-allocation, booking-integration, order-model-trading-capacity, post-trade-analytics ← oms-concepts/<same>
  interfaces/     command-api, query-api, rest-read-api ← interfaces/<same>
                  message-api ← merge(interfaces/kafka-topics, interfaces/avro-messages)
capabilities/     index + 19 capabilities (unchanged paths)
  use-cases/ (n)  actors/ (n)
  functional-requirements/ ← functional-requirements/     non-functional-requirements/ ← non-functional-requirements/
tools/            knowledge-server ← architecture/mcp-server
                  kb-explorer, developer-cockpit ← architecture/<same>
                  mission-control ← oms-concepts/mission-control (re-typed Component)
delivery/         manifesto, skill-profiles, software-architecture-methodology, ai-augmented-development ← oms-methodolgy/<same>
                  testing ← oms-framework/testing-patterns
                  spec-driven-development, ci-cd, release-and-deploy (n)
infrastructure/   local-docker-stack, cozystack, observability (n)
ui/               admin-ui ← ui/oms-admin-ui_spec
                  order-state-indicator ← illustrations/order-state-indicator-spec
                  design-system (n)
semantic-layer/   knowledge-base-strategy ← oms-knowledge-base-strategy (rewritten to the new structure)
                  knowledge-graph, schema-and-constraints, kb-review-2026-11 (n)
archive/          kb-review-report-2026-02 ← KNOWLEDGE-BASE-REVIEW-REPORT        (superseded_by semantic-layer/kb-review-2026-11)
                  state-query-store ← oms-framework/state-query-store_spec        (superseded_by framework/query-engine)
                  agent-profile-java-backend ← oms-methodolgy/agent.md            (superseded_by delivery/skill-profiles, if review confirms overlap)
storyboards/      unchanged (not part of the bundle)
animations/       unchanged (deferred, see Decisions)
```

Moved files from `oms-core/docs/` leave no stub behind. Their in-repo references are fixed in
Block E.

## Contract Changes

None. No OpenAPI or Avro file changes. The MCP tool signatures (`readKnowledgeBase`,
`searchKnowledgeBase`) keep their parameters. Two behaviours are added and are compatible for
existing callers:
- an alias redirect, where today's result for a missing path is an error;
- deprecated documents are hidden from search by default. Callers passing `status=deprecated`
  still get them.

## Data & Persistence

None. No entity, table or Liquibase change. The MCP index is rebuilt from files at startup as
today.

## Events & Messaging

None. No order events, outbox messages or topics are touched.

## Domain, State & Orchestration

None. No state machine, task pipeline or validation change. Javadoc comments in oms-core change only
their `@see` targets.

## Alternatives & Decisions

- **Top-level `framework/` + `domain/` instead of the outline's `specs/`.** The proposal assumed
  this and it was approved.
  - Rejected: `specs/`. It clashes with the repository `specs/` (tickets) in agent prompts, in
    grep results and in MCP citations (`oms-knowledge-base/specs/...` versus `specs/changes/...`).
- **Capability sub-model lives under `capabilities/`** (`use-cases/`, `actors/`,
  `functional-requirements/`, `non-functional-requirements/`).
  - Rejected: separate top-level `requirements/`. The outline groups them under capabilities, and
    keeping them under one folder makes the cockpit's single root and the MCP `category` filter
    (`capabilities`) return the whole catalogue.
- **Use cases are documents (one per UC) with front matter, not a section inside each
  capability.**
  - Rejected: sections. The cockpit's Use Cases tab, OKF typing, MCP type filter and link
    tracing all work per document, and a capability can have several use cases.
- **Old ids resolve through `aliases` front matter**, read by the MCP server and checked by
  `OMS-ALIAS`.
  - Rejected: redirect stub files at old paths. They would keep the legacy folders alive (AC-1
    forbids them) and pollute search.
  - Rejected: a separate alias JSON file. A second source of truth would drift from the moves.
  - OKF allows unknown keys, so `aliases` is legal.
- **Review state is shown by `updated` ≥ `reviewed_since`, not `verified`.**
  `OMS-UNVERIFIED` stays because agents cannot claim human review. `reviewed_since` lives in the
  conventions so the next review only bumps one value.
- **Retired terms are data in `okf-conventions.md`, not code**, so the list can grow without a
  checker change. The register is the single exemption, via `register: true`, because it must name
  old paths.
- **Delete the SPEC-0009 metadata-baseline test** (`mcp-metadata*`, `baseline-metadata.json`,
  `capture-baseline.mjs`). It proves the 2026-10 conversion preserved legacy bold-header metadata,
  keyed by paths that cease to exist. Block C deliberately removes those headers.
  - Rejected: re-keying the baseline to new paths. That would freeze the stale header values this
    ticket removes.
  - The MCP server's fallback parsing of bold headers stays (other doc paths may still use them);
    its unit tests in `MarkdownParserTest` remain.
- **Long, unbuilt-behaviour specifications get an implementation-status banner rather than a
  rewrite.**
  - Rejected: rewriting 1,000+ line papers into "planned" voice. That is high cost and loses
    design reasoning the capabilities link to.
  - The banner plus `status: draft` makes the truth visible to people and to agents (search
    facets).
- **Merges.**
  - The simulator component and simulator spec merge into one Component.
  - Kafka topics and Avro messages merge into `message-api`, which keeps the `covers` uniqueness.
  - The state-query-store spec is archived and replaced by a new `framework/query-engine` written
    from the code. The old spec describes a ReadySet store that was never built (CLAUDE.md, P-09).
- **`animations/` stays at the bundle root** (proposal: deferred). It holds Python scenes with
  relative output paths, no concepts, and nothing links to it. AC-1 lists it.
- **Cockpit KB layout in one module (`kbLayout.ts`).** Today three files hard-code folder names,
  and this ticket is exactly the change that broke that pattern.
- **MCP alias lookup scans files on every miss, with no cache.** The bundle has about 120 files, a
  miss is rare (old paths only), and a cache would need invalidation when files change while the
  server runs.
- **No new dependencies.**
  - okf-check keeps `js-yaml`; `check-kb-refs.mjs` uses `node:child_process` for `git ls-files`.
  - The cockpit keeps `gray-matter`.
  - The MCP server reuses its `FrontMatter` parser.

- **Changed during implementation: `point_in_time: true` replaces `register: true`** as the
  `OMS-RETIRED` exemption. The moved assessments (architecture reviews, the load baseline, the
  convergence assessment) are dated records that describe the system of their day, just like the
  register. Rewriting their findings to today's terms would falsify them, and archiving them would
  hide current findings. They carry `point_in_time: true` and stay under
  `architecture/assessments/`, which `check-kb-refs` also excludes for the same reason.
- **Changed during implementation: `oms-core/docs/architecture-specification.md` is archived**, not
  kept under assessments. It is a "living" architecture spec from August 2026 whose content is now
  split across `architecture/context`, `architecture/concepts`, `framework/` and the target
  architecture, and it still describes ReadySet and Jaeger.
- **Changed during implementation: the archive folder is a fixed name** (`ARCHIVE_DIR = 'archive'`
  in okf-check), not an `archive_dir` setting in the conventions. Nothing needs it configurable.
- **Changed during implementation: fixtures are checked out with LF** (`tools/okf-check/.gitattributes`).
  The checker tests match fixture text byte for byte, and on a Windows checkout with
  `core.autocrlf=true` they failed before this ticket.

- **Changed during implementation: `check-kb-refs` refinements.** (1) Test sources are exempt from
  the "path must exist" part (still checked for retired folder names): their fixtures name paths in
  temporary workspaces that never exist in the repository. (2) `aliases:` lines are skipped: a moved
  concept names its former ids on purpose. (3) `oms-core/src/main/resources/db/changelog/` is
  excluded: an applied changeset is never edited (policy P-07), not even a comment, so one comment
  keeps naming the old state-store path.
- **Changed during implementation: the retrieval golden set gained expectations** for queries whose
  right answer moved or became a new document (FR-002 and UC-001 for "which validations run",
  `domain/model/order-state.md` for state transitions, and so on). No threshold was lowered:
  recall@5 1.000 (baseline 0.90), MRR 0.808 (floor 0.80).
- **Added during implementation:** `KbService` (cockpit) filed each root file under a category of
  its own; root files now belong to `root`. The storyboard evidence card's `kb_links` follows the
  move of `order-state.md`.

- **Changed during implementation (build change, P-17): the `qdrant` service and its
  `qdrant_storage` volume are removed from the root `docker-compose.yml`.** The knowledge server has
  used an embedded Lucene index since commit 8fa55b3 (July 2026); nothing reads Qdrant, which the
  maintainer confirmed in review. Rejected: keeping it as an unused container (resources, and it
  misled readers into thinking the MCP index lives there). No service, port or dependency of any
  remaining service changes. Existing setups drop the container with `docker compose up -d
  --remove-orphans`.
- **Changed during implementation: cockpit Knowledge Base tree.** `KbCategory` gains an `id` (the
  folder path) and `KbDocument` a `folder`; `getCategories` returns a tree to any depth and
  `getDocuments(id)` returns only that folder's own documents, without index.md and log.md. The old
  shape assumed one folder level, which the new layout exposed (sub-folders opened empty).

- **Changed after the independent review:** `check-kb-refs` also reports retired file names written
  on their own (the old name of every moved or archived document that no current document carries,
  read from the review register) and `oms-core/docs/<path>` references that no longer exist. The
  dispatch extractor of the coverage test reads `CommandDispatcher`, the one router every path
  uses since SPEC-0046.
- **Not changed, recorded as debt (TD-14):** `specs/config.json` lists no `verify` commands for
  `oms-knowledge-base`, so `spec verify` does not run the knowledge base checks; it is gate
  configuration, which only the maintainer edits. The checks were run by hand for this ticket.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Volume: about 95 documents to move and review, so review quality varies | The review is driven by checkable claims (names, paths, technologies, stated-as-current behaviour) rather than prose polish. Every finding is recorded in the register, and `needs-human` flags the documents the team should read first. The retired-terms rule catches the known stale technology claims mechanically. |
| Broken links after the move | Links are rewritten by script from the same map, then `OKF-LINK`, reachability and `check-kb-refs` must all pass. |
| Agents and tools holding old paths (chat history, Copilot instructions, Javadoc) | MCP `aliases` redirect; all in-repo references updated and guarded by `check-kb-refs`. |
| Retrieval quality drops because documents were renamed or merged | `RetrievalEvalTest` stays at ≥ 0.90 with the new expected paths and new queries. Deprecated documents are excluded from default search, which removes known misleading competitors. |
| Peer sessions editing the KB during the move (memory: parallel sessions share the tree) | Blocks B and C run in one sitting, and the plan starts Block B with a `git status` check of `oms-knowledge-base/`. Verify runs in a quiet window. |
| Coverage tests in okf-check fail mid-migration | Block A changes rules and fixtures only. The real-bundle test is expected to fail between Blocks A and D; each block's verify names which tests must pass at that point. |
| Cockpit type change (`Actor.type` → `kind`, FR `status` semantics) breaks other views | `npm run typecheck` catches every consumer. The requirements types are used only by the requirements store and tabs (grep). |

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit + bundle | `tools/okf-check/test/kb-coverage.test.mjs#bundle root has only the target layout`; CLI run `node tools/okf-check/okf-check.mjs oms-knowledge-base` | Root entries are exactly the allowed set; no `oms-concepts`, `oms-framework` or `oms-methodolgy`; checker exit 0; `npm test` in `tools/okf-check` green |
| AC-2 | bundle | `kb-coverage.test.mjs#review register covers every pre-reorganisation document` | `git ls-tree -r --name-only 33f4e20 -- oms-knowledge-base` `.md` files (storyboards included as `keep`) each appear exactly once in the register table, with a valid disposition, and every non-`delete` new path exists |
| AC-3 | unit | `okf-check.test.mjs#OMS-REVIEWED rejects missing or old updated`, `#OMS-RETIRED rejects retired terms in prose`, `#OMS-RETIRED ignores fenced code and the register`; real bundle in `#the real bundle conforms` | Each failure path yields the rule error; the real bundle passes |
| AC-4 | unit | `okf-check.test.mjs#OMS-ARCHIVE requires deprecated in archive`, `#OMS-ARCHIVE requires superseded_by on deprecated concepts` | Fixtures fail as specified; the valid fixture (with one archive doc) passes |
| AC-5 | unit + bundle | `okf-check.test.mjs#OMS-CAP requires a use case`, `#OMS-UC …` (id, actors, capability, requirement link), `#OMS-ACTOR …`, `#OMS-TRACE requirement not in any use case`; `kb-coverage.test.mjs#every command schema belongs to exactly one capability` | Each rule's failure fixture fails; the real bundle passes |
| AC-6 | bundle | `kb-coverage.test.mjs#every command schema belongs to exactly one capability` (dispatch check) + `okf-check` `OMS-SRC` on the real bundle | Implemented/partial requirements cite existing main and test sources; no capability is `implemented` with undispatched commands |
| AC-7 | unit (vitest) | `developer-cockpit/test/main/RequirementsService.test.ts` (new): `reads the real knowledge base`, `maps FR implementation`, `maps actor kind`, `capability lists linked use cases and requirements`; `test/renderer/RequirementsView.test.tsx` (new): `shows a Capabilities tab with maturity`; `test/main/KbService.test.ts#categories are the bundle top-level folders`; `test/main/LinkIndexService.test.ts` (paths updated) | Counts equal the okf-check counts (FR/NFR files); ≥1 UC, actor and capability; no `oms-concepts` string in `src/` (asserted by a grep test in `RequirementsService.test.ts#no legacy folder names in src`); `npm run typecheck`, `npm test` pass |
| AC-8 | unit | `oms-mcp-server` `DocumentRepositoryTest#resolvesFormerIdThroughAliases`, `#unknownIdStillNotFound`, `#categoryFallsBackToTopLevelFolder`; `KnowledgeBaseToolsTest#readKnowledgeBaseReportsMove`, `#searchHidesDeprecatedByDefault` | An old id returns the moved document and the "Moved" line; an unknown id gives the error; `./gradlew check` passes |
| AC-9 | integration (real KB) | `RetrievalEvalTest` (existing) + `RetrievalEvalTest#goldenSetCoversEveryTopLevelFolder` (new) + `#expectedPathsExist` (new) | recall@5 ≥ 0.90; ≥1 query per new top-level folder; every expected path exists |
| AC-10 | script + unit | `tools/okf-check/test/check-kb-refs.test.mjs` (fixture repo: dangling ref fails, `file:///` ref resolves, excluded dirs ignored, legacy folder name fails); CLI `node tools/okf-check/check-kb-refs.mjs` on the repo → exit 0; `npm run build` in oms-kb-explorer; `npm run check:storyboards` in developer-cockpit | No dangling KB references in the repo; builds and storyboard check pass |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contract files are added or moved. Interface docs only describe the contracts. |
| P-02 | Specification before code, generated models only | comply | The ticket is the spec. Checker rules and conventions (the KB's "contract") are written before the content migration (Block A before B to D). No models are hand-written. |
| P-03 | Never edit generated code | comply | No generated files touched. OpenWiki pages are excluded from edits and from `check-kb-refs`. |
| P-04 | Contracts evolve compatibly | comply | No OpenAPI/Avro change. MCP tool signatures are unchanged; old KB paths keep working through aliases. |
| P-05 | Every state change is recorded in the event log | n/a | No order state changes. |
| P-06 | Kafka only through the transactional outbox | n/a | No messaging change. |
| P-07 | Schema changes through new Liquibase changesets | n/a | No schema change. |
| P-08 | Concurrency and idempotency are explicit | n/a | No commands or consumers change. The MCP alias lookup is read-only file access. |
| P-09 | Commands and queries stay separate | n/a | No API change. The new `framework/query-engine` documents the existing separation. |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No transition logic changes. |
| P-11 | Layering and conventions | comply | MCP: the alias logic sits in `docs/DocumentRepository` (I/O) and the presentation in `kb/KnowledgeBaseTools`, following the existing split. Cockpit: data in `main/services`, IPC in `main/ipc`, UI in `renderer/views/requirements`, following the existing tabs. |
| P-12 | Jackson 3 only | comply | The MCP changes reuse the existing YAML front matter parser and add no Jackson imports. Any JSON handling uses `tools.jackson`. |
| P-13 | Errors and validation follow the framework specs | comply | The MCP unknown-path error text is unchanged. The checker reports `ERROR <file> [<rule>]` as before. |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Every AC maps to a named test above. Checker rules get failing fixtures before the bundle is migrated. |
| P-15 | Observability | n/a | No runtime path in the order flow changes. The MCP alias hit is logged at info, like the existing `[MCP] readKnowledgeBase` log line. |
| P-16 | Security | comply | Alias resolution only returns paths under the configured base dirs (the existing `startsWith(base)` check is reused). `check-kb-refs` only reads `git ls-files` output. No secrets. |
| P-17 | Simplicity and dependencies | comply | No new dependencies. One layout module replaces three hard-coded copies. A dead config key and a finished transitional test are removed. |
| P-18 | Modules build standalone | comply | oms-mcp-server and developer-cockpit changes are internal to each module. Tests that read the real KB already rely on the repository layout, as today (`RetrievalEvalTest`, the cockpit's `LinkIndexService` tests use fixtures). |
| P-19 | Documentation follows behaviour | comply | This ticket is the KB update. Also updated: `okf-conventions.md`, `tools/okf-check/README.md`, `tools/knowledge-server.md` (alias redirect, deprecated filter), `tools/developer-cockpit.md` (Capabilities tab), `capabilities/knowledge-services.md` with a new FR (alias resolution), and `log.md`. No OpenWiki page is hand-edited. |

## Knowledge Base Updates

Every page under `oms-knowledge-base/` is moved and/or reviewed (Blocks B to D). Specifically for
the behaviour this ticket changes:

- `okf-conventions.md`: new types (`Use Case`, `Actor`, `Pattern`), the keys `aliases`,
  `superseded_by`, `register`, `id` for ADRs, `reviewed_since`, `retired_terms`, and the new
  folder layout.
- `semantic-layer/schema-and-constraints.md` (new): every checker rule, including the new ones.
- `tools/knowledge-server.md` (from `architecture/mcp-server.md`): alias redirect, `category` =
  top-level folder, deprecated hidden by default.
- `tools/developer-cockpit.md`: Capabilities tab, implementation badges, layout module.
- `capabilities/knowledge-services.md`, plus a new `FR-047-resolve-moved-knowledge-documents.md`
  (implemented; cites `DocumentRepository` and `DocumentRepositoryTest`) and
  `FR-048-browse-capability-catalogue.md` (implemented; cites `RequirementsService` and its test).
- `semantic-layer/knowledge-base-strategy.md`: rewritten to the new structure.
- `semantic-layer/kb-review-2026-11.md`: the register.
- `index.md`: new root index by section. `log.md`: the 2026-11-14 entry.
- `tools/okf-check/README.md` (outside the bundle): the new rules and scripts.
